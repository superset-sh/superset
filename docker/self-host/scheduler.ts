type Cadence = { everyMinutes: number } | { minute: number; hour?: number };

const JOBS: ReadonlyArray<{ path: string; cadence: Cadence }> = [
	{
		path: "/api/ingest/jobs/maintain-partitions",
		cadence: { hour: 2, minute: 10 },
	},
	{ path: "/api/automations/evaluate", cadence: { everyMinutes: 1 } },
	{ path: "/api/ingest/jobs/enforce-retention", cadence: { everyMinutes: 5 } },
	{ path: "/api/files/jobs/sweep", cadence: { hour: 2, minute: 20 } },
	{
		path: "/api/account/jobs/purge-expired-deletions",
		cadence: { hour: 2, minute: 30 },
	},
	{
		path: "/api/integrations/linear/jobs/refresh-tokens",
		cadence: { everyMinutes: 15 },
	},
	{
		path: "/api/integrations/linear/jobs/sweep-abandoned",
		cadence: { everyMinutes: 5 },
	},
	{
		path: "/api/integrations/google/jobs/renew-watches",
		cadence: { hour: 2, minute: 40 },
	},
	{
		path: "/api/integrations/microsoft-teams/jobs/renew-subscriptions",
		cadence: { minute: 15 },
	},
	{ path: "/api/integrations/jobs/suspend", cadence: { minute: 25 } },
	{ path: "/api/analytics/jobs/refresh-mrr", cadence: { minute: 35 } },
];

export function nextScheduledAt(path: string, after: number): number {
	const cadence = JOBS.find((job) => job.path === path)?.cadence;
	if (!cadence || !Number.isFinite(after))
		throw new Error("Invalid scheduler job or time");
	if ("everyMinutes" in cadence) {
		const interval = cadence.everyMinutes * 60_000;
		return (Math.floor(after / interval) + 1) * interval;
	}
	const date = new Date(after);
	date.setUTCSeconds(0, 0);
	date.setUTCMinutes(cadence.minute);
	if (cadence.hour !== undefined) date.setUTCHours(cadence.hour);
	if (date.getTime() <= after) {
		if (cadence.hour !== undefined) date.setUTCDate(date.getUTCDate() + 1);
		else date.setUTCHours(date.getUTCHours() + 1);
	}
	return date.getTime();
}

export interface SchedulerOptions {
	apiOrigin: string;
	secret: string;
	analyticsEnabled: boolean;
	jobs?: readonly string[];
	maxConcurrent?: number;
	timeoutMs?: number;
	pollMs?: number;
	retryDelayMs?: number;
	now?: () => number;
	monotonicNow?: () => number;
	fetcher?: (url: string, init: RequestInit) => Promise<Response>;
}

export function schedulerOptionsFromEnvironment(
	environment: Record<string, string | undefined>,
): SchedulerOptions | null {
	if (environment.SELF_HOST_QUEUE !== "1") return null;
	return {
		apiOrigin:
			environment.QUEUE_API_URL || environment.NEXT_PUBLIC_API_URL || "",
		secret: environment.SELF_HOST_QUEUE_SECRET || "",
		analyticsEnabled: Boolean(environment.STRIPE_SECRET_KEY),
	};
}

interface JobState {
	path: string;
	nextDue: number;
	due: boolean;
	retryAt: number | null;
	attempts: number;
	controller: AbortController | null;
	running: Promise<void> | null;
}

function boundedInteger(value: number, maximum: number): number {
	if (!Number.isInteger(value) || value < 1 || value > maximum) {
		throw new Error("Invalid scheduler resource bound");
	}
	return value;
}

export class NativeScheduler {
	private readonly origin: string;
	private readonly secret: string;
	private readonly jobs: JobState[];
	private readonly maxConcurrent: number;
	private readonly timeoutMs: number;
	private readonly pollMs: number;
	private readonly retryDelayMs: number;
	private readonly now: () => number;
	private readonly monotonicNow: () => number;
	private readonly fetcher: (
		url: string,
		init: RequestInit,
	) => Promise<Response>;
	private timer: ReturnType<typeof setInterval> | null = null;
	private stopped = false;

	constructor(options: SchedulerOptions) {
		let origin: URL;
		try {
			origin = new URL(options.apiOrigin);
		} catch {
			throw new Error("Invalid scheduler API origin");
		}
		if (
			!["http:", "https:"].includes(origin.protocol) ||
			origin.username ||
			origin.password ||
			origin.pathname !== "/" ||
			origin.search ||
			origin.hash
		)
			throw new Error("Invalid scheduler API origin");
		if (
			options.secret.length < 32 ||
			options.secret.trim() !== options.secret ||
			/[^\x20-\x7e]/.test(options.secret)
		) {
			throw new Error("Invalid scheduler secret");
		}
		this.origin = origin.origin;
		this.secret = options.secret;
		this.maxConcurrent = boundedInteger(options.maxConcurrent ?? 4, 4);
		this.timeoutMs = boundedInteger(options.timeoutMs ?? 900_000, 900_000);
		this.pollMs = boundedInteger(options.pollMs ?? 1_000, 60_000);
		this.retryDelayMs = boundedInteger(options.retryDelayMs ?? 5_000, 30_000);
		this.now = options.now ?? Date.now;
		this.monotonicNow = options.monotonicNow ?? (() => performance.now());
		this.fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
		const paths = options.jobs ?? JOBS.map((job) => job.path);
		if (
			new Set(paths).size !== paths.length ||
			paths.some((path) => !JOBS.some((job) => job.path === path))
		) {
			throw new Error("Invalid scheduler route selection");
		}
		const now = this.now();
		this.jobs = paths
			.filter(
				(path) =>
					options.analyticsEnabled ||
					path !== "/api/analytics/jobs/refresh-mrr",
			)
			.map((path) => ({
				path,
				nextDue: nextScheduledAt(path, now),
				due: true,
				retryAt: null,
				attempts: 0,
				controller: null,
				running: null,
			}));
	}

	start(): void {
		if (this.stopped || this.timer) return;
		this.timer = setInterval(() => this.tick(), this.pollMs);
		this.tick();
	}

	tick(): void {
		if (this.stopped) return;
		const now = this.now();
		const elapsed = this.monotonicNow();
		for (const job of this.jobs) {
			if (now >= job.nextDue) {
				job.due = true;
				job.nextDue = nextScheduledAt(job.path, now);
			}
		}
		let active = this.jobs.filter((job) => job.running).length;
		for (const job of this.jobs) {
			if (active >= this.maxConcurrent) break;
			if (
				job.running ||
				(job.retryAt === null ? !job.due : elapsed < job.retryAt)
			)
				continue;
			job.due = false;
			job.retryAt = null;
			job.attempts++;
			job.controller = new AbortController();
			job.running = this.deliver(job).finally(() => {
				job.running = null;
				job.controller = null;
			});
			active++;
		}
	}

	private async deliver(job: JobState): Promise<void> {
		const controller = job.controller;
		if (!controller) return;
		const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
		let success = false;
		try {
			const response = await this.fetcher(`${this.origin}${job.path}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-self-host-queue": this.secret,
				},
				body: "{}",
				redirect: "error",
				signal: controller.signal,
			});
			success = response.ok;
			await response.body?.cancel();
		} catch {
			success = false;
		} finally {
			clearTimeout(timeout);
		}
		if (this.stopped) return;
		if (success) {
			job.attempts = 0;
		} else if (job.attempts < 3) {
			job.retryAt =
				this.monotonicNow() + this.retryDelayMs * 2 ** (job.attempts - 1);
		} else {
			job.attempts = 0;
			job.due = false;
			console.error(
				`[self-host scheduler] ${job.path} failed after 3 attempts`,
			);
		}
	}

	async stop(): Promise<void> {
		this.stopped = true;
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		for (const job of this.jobs) job.controller?.abort();
		await Promise.allSettled(
			this.jobs.flatMap((job) => (job.running ? [job.running] : [])),
		);
	}
}

if (import.meta.main) {
	const options = schedulerOptionsFromEnvironment(process.env);
	if (options) {
		const scheduler = new NativeScheduler(options);
		const shutdown = async () => {
			await scheduler.stop();
			process.exit(0);
		};
		process.once("SIGTERM", shutdown);
		process.once("SIGINT", shutdown);
		scheduler.start();
	}
}
