import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import {
	MAX_QUEUE_REQUEST_BYTES,
	matchesQueueSecret,
	type PublishOpts,
	QueueValidationError,
	queueDelayMilliseconds,
	queueDestination,
	readQueueJSON,
	SELF_HOST_QUEUE_HEADER,
	validateQueuePublication,
} from "../../packages/shared/src/self-host-queue";

interface StoredJob {
	id: string;
	url: string;
	body: string;
	headers: string;
	retries: number;
	attempts: number;
	failure_callback: string | null;
	lease_token: string;
}
interface QueueOptions {
	database: string;
	apiOrigin: string;
	deliveryOrigin: string;
	secret: string;
	now?: () => number;
	fetch?: (url: URL, init: RequestInit) => Promise<Response>;
	busyTimeoutMs?: number;
}
function origin(value: string): string {
	try {
		const url = new URL(value);
		if (
			!["http:", "https:"].includes(url.protocol) ||
			url.username ||
			url.password ||
			url.pathname !== "/" ||
			url.search ||
			url.hash
		)
			throw new Error();
		return url.origin;
	} catch {
		throw new Error("Self-host queue requires valid API and delivery origins");
	}
}
function deliveryHeaders(
	value: Record<string, string> = {},
): Record<string, string> {
	const headers = new Headers(value);
	const nominated = new Set(
		(headers.get("connection") ?? "")
			.toLowerCase()
			.split(",")
			.map((name) => name.trim()),
	);
	const blocked = new Set([
		"host",
		"connection",
		"keep-alive",
		"proxy-authenticate",
		"proxy-authorization",
		"te",
		"trailer",
		"transfer-encoding",
		"upgrade",
		"content-length",
		"content-encoding",
		"forwarded",
		SELF_HOST_QUEUE_HEADER,
	]);
	for (const name of Array.from(headers.keys())) {
		if (
			blocked.has(name) ||
			nominated.has(name) ||
			name.startsWith("upstash-") ||
			name.startsWith("x-forwarded-")
		)
			headers.delete(name);
	}
	return Object.fromEntries(headers);
}
export class DurableQueue {
	private readonly db: Database;
	private readonly apiOrigin: string;
	private readonly deliveryOrigin: string;
	private readonly secret: string;
	private readonly now: () => number;
	private readonly fetch: NonNullable<QueueOptions["fetch"]>;
	private closed = false;
	constructor(options: QueueOptions) {
		this.apiOrigin = origin(options.apiOrigin);
		this.deliveryOrigin = origin(options.deliveryOrigin);
		if (options.secret.length < 32 || /[\r\n\0]/.test(options.secret))
			throw new Error(
				"Self-host queue requires a secret of at least 32 characters",
			);
		this.secret = options.secret;
		this.now = options.now ?? Date.now;
		this.fetch = options.fetch ?? fetch;
		const busyTimeoutMs = options.busyTimeoutMs ?? 5000;
		if (
			!Number.isInteger(busyTimeoutMs) ||
			busyTimeoutMs < 0 ||
			busyTimeoutMs > 5000
		)
			throw new Error("Invalid SQLite lock timeout");
		this.db = new Database(options.database, { create: true, strict: true });
		this.db.exec(`PRAGMA busy_timeout=${busyTimeoutMs}; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
			CREATE TABLE IF NOT EXISTS jobs (
			id TEXT PRIMARY KEY, url TEXT NOT NULL, body TEXT NOT NULL, headers TEXT NOT NULL,
			retries INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, failure_callback TEXT,
			dedupe TEXT, created_at INTEGER NOT NULL, available_at INTEGER NOT NULL, lease_until INTEGER,
			state TEXT NOT NULL DEFAULT 'pending', finished_at INTEGER, last_status INTEGER, last_error TEXT,
			lease_token TEXT);
			CREATE INDEX IF NOT EXISTS jobs_due ON jobs(state, available_at);
			CREATE INDEX IF NOT EXISTS jobs_dedupe ON jobs(dedupe, created_at);
			CREATE INDEX IF NOT EXISTS jobs_finished ON jobs(finished_at);`);
		this.db
			.transaction(() => {
				const columns = this.db
					.query<{ name: string }, []>("PRAGMA table_info(jobs)")
					.all();
				if (!columns.some((column) => column.name === "lease_token"))
					this.db.exec("ALTER TABLE jobs ADD COLUMN lease_token TEXT");
			})
			.immediate();
	}
	private destination(value: string): string {
		const url = queueDestination(value);
		if (url.origin !== this.apiOrigin) throw new QueueValidationError();
		return `${this.deliveryOrigin}${url.pathname}${url.search}`;
	}
	private insert(
		opts: PublishOpts,
		now: number,
		bodyLimit = 1_048_576,
		id: string = randomUUID(),
	): { messageId: string } {
		this.destination(opts.url);
		if (opts.failureCallback) this.destination(opts.failureCallback);
		const body = JSON.stringify(opts.body === undefined ? {} : opts.body);
		if (Buffer.byteLength(body) > bodyLimit) throw new QueueValidationError();
		const available =
			opts.notBefore === undefined
				? now + queueDelayMilliseconds(opts.delay)
				: opts.notBefore * 1000;
		if (!Number.isSafeInteger(available)) throw new QueueValidationError();
		if (opts.deduplicationId) {
			const previous = this.db
				.query<{ id: string }, [string, number]>(
					"SELECT id FROM jobs WHERE dedupe=? AND created_at>? ORDER BY created_at DESC LIMIT 1",
				)
				.get(opts.deduplicationId, now - 600_000);
			if (previous) return { messageId: previous.id };
		}
		this.db
			.query(
				"INSERT INTO jobs(id,url,body,headers,retries,failure_callback,dedupe,created_at,available_at) VALUES(?,?,?,?,?,?,?,?,?)",
			)
			.run(
				id,
				opts.url,
				body,
				JSON.stringify(deliveryHeaders(opts.headers)),
				opts.retries ?? 3,
				opts.failureCallback ?? null,
				opts.deduplicationId ?? null,
				now,
				available,
			);
		return { messageId: id };
	}
	publish(value: unknown): { messageId: string } {
		const opts = validateQueuePublication(value);
		return this.db.transaction(() => this.insert(opts, this.now())).immediate();
	}
	private claim(): StoredJob | null {
		return this.db
			.transaction(() => {
				const now = this.now();
				this.db
					.query(
						"UPDATE jobs SET state='pending',lease_until=NULL,lease_token=NULL WHERE state='running' AND lease_until<=?",
					)
					.run(now);
				const row = this.db
					.query<StoredJob, [number]>(
						"SELECT * FROM jobs WHERE state='pending' AND available_at<=? ORDER BY available_at,created_at,id LIMIT 1",
					)
					.get(now);
				if (!row) return null;
				const token = randomUUID();
				this.db
					.query(
						"UPDATE jobs SET state='running',lease_until=?,lease_token=? WHERE id=? AND state='pending'",
					)
					.run(now + 960_000, token, row.id);
				return { ...row, lease_token: token };
			})
			.immediate();
	}
	private async deliver(job: StoredJob): Promise<void> {
		let status: number | null = null;
		let error: string | null = null;
		try {
			const headers = new Headers(deliveryHeaders(JSON.parse(job.headers)));
			headers.set("content-type", "application/json");
			headers.set(SELF_HOST_QUEUE_HEADER, this.secret);
			headers.set("upstash-message-id", job.id);
			headers.set("upstash-retried", String(job.attempts));
			const response = await this.fetch(new URL(this.destination(job.url)), {
				method: "POST",
				headers,
				body: job.body,
				redirect: "error",
				signal: AbortSignal.timeout(900_000),
			});
			status = response.status;
			await response.body?.cancel();
			if (!response.ok) error = "Delivery returned an unsuccessful status";
		} catch {
			error = "Delivery failed or timed out";
		}
		this.db
			.transaction(() => {
				const now = this.now();
				if (error === null) {
					this.db
						.query(
							"UPDATE jobs SET state='done',finished_at=?,lease_until=NULL,lease_token=NULL,last_status=?,last_error=NULL WHERE id=? AND state='running' AND lease_token=?",
						)
						.run(now, status, job.id, job.lease_token);
				} else if (job.attempts < job.retries) {
					this.db
						.query(
							"UPDATE jobs SET state='pending',attempts=attempts+1,available_at=?,lease_until=NULL,lease_token=NULL,last_status=?,last_error=? WHERE id=? AND state='running' AND lease_token=?",
						)
						.run(
							now + Math.min(300_000, 5000 * 2 ** job.attempts),
							status,
							error,
							job.id,
							job.lease_token,
						);
				} else {
					const changed = this.db
						.query(
							"UPDATE jobs SET state='failed',finished_at=?,lease_until=NULL,lease_token=NULL,last_status=?,last_error=? WHERE id=? AND state='running' AND lease_token=?",
						)
						.run(now, status, error, job.id, job.lease_token).changes;
					if (changed && job.failure_callback)
						this.insert(
							{
								url: job.failure_callback,
								body: {
									sourceMessageId: job.id,
									sourceBody: Buffer.from(job.body).toString("base64"),
									status: status ?? 0,
									error,
									retried: job.attempts,
								},
								retries: 3,
							},
							now,
							2_097_152,
							`failure:${job.id}`,
						);
				}
			})
			.immediate();
	}
	async runDue(limit = 4): Promise<void> {
		if (!Number.isInteger(limit) || limit < 1 || limit > 100)
			throw new QueueValidationError();
		this.db
			.query(
				"DELETE FROM jobs WHERE state IN ('done','failed') AND finished_at<?",
			)
			.run(this.now() - 7 * 86400_000);
		let failed = false;
		const completed = await Promise.allSettled(
			Array.from({ length: limit }, async () => {
				try {
					while (!failed) {
						const job = this.claim();
						if (!job) return;
						await this.deliver(job);
					}
				} catch (error) {
					failed = true;
					throw error;
				}
			}),
		);
		if (completed.some((delivery) => delivery.status === "rejected"))
			throw new Error("Self-host queue drain failed");
	}
	stats(): Record<"pending" | "running" | "done" | "failed", number> {
		const stats = { pending: 0, running: 0, done: 0, failed: 0 };
		for (const row of this.db
			.query<{ state: string; count: number }, []>(
				"SELECT state,COUNT(*) AS count FROM jobs GROUP BY state",
			)
			.all())
			if (row.state in stats) Reflect.set(stats, row.state, row.count);
		return stats;
	}
	async handle(request: Request): Promise<Response> {
		const path = new URL(request.url).pathname;
		if (path === "/health" && request.method === "GET")
			return Response.json(this.stats());
		if (path !== "/jobs" || request.method !== "POST")
			return new Response(null, { status: 404 });
		if (
			!matchesQueueSecret(
				this.secret,
				request.headers.get(SELF_HOST_QUEUE_HEADER),
			)
		)
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		let value: unknown;
		try {
			value = await readQueueJSON(request.body, MAX_QUEUE_REQUEST_BYTES);
		} catch {
			return Response.json({ error: "Invalid publication" }, { status: 400 });
		}
		try {
			return Response.json(this.publish(value), { status: 202 });
		} catch (error) {
			return Response.json(
				{
					error:
						error instanceof QueueValidationError
							? "Invalid publication"
							: "Persistence unavailable",
				},
				{ status: error instanceof QueueValidationError ? 400 : 503 },
			);
		}
	}
	close(): void {
		if (!this.closed) {
			this.db.close();
			this.closed = true;
		}
	}
}

if (import.meta.main) {
	const queue = new DurableQueue({
		database: process.env.QUEUE_DATABASE ?? "/data/queue.sqlite",
		apiOrigin: process.env.NEXT_PUBLIC_API_URL ?? "",
		deliveryOrigin: process.env.QUEUE_API_URL ?? "",
		secret: process.env.SELF_HOST_QUEUE_SECRET ?? "",
	});
	const server = Bun.serve({
		port: 8789,
		maxRequestBodySize: MAX_QUEUE_REQUEST_BYTES,
		fetch: (request) => queue.handle(request),
	});
	let running = false;
	const interval = setInterval(() => {
		if (running) return;
		running = true;
		void queue
			.runDue()
			.catch(() => console.error("Self-host queue worker unavailable"))
			.finally(() => {
				running = false;
			});
	}, 250);
	const stop = () => {
		clearInterval(interval);
		server.stop();
	};
	process.on("SIGTERM", stop);
	process.on("SIGINT", stop);
}
