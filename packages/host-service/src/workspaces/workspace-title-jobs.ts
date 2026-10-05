import type { HostDb } from "../db";

const MAX_RUNNING = 2;
const MAX_QUEUED = 32;
const SHUTDOWN_TIMEOUT_MS = 1_000;

interface TitleJob {
	workspaceId: string;
	controller: AbortController;
	run: (isCurrent: () => boolean, signal: AbortSignal) => Promise<void>;
}

interface TitleJobs {
	pending: Map<string, TitleJob>;
	followUps: Map<string, TitleJob["run"]>;
	queue: TitleJob[];
	active: Map<TitleJob, Promise<void>>;
	commits: Map<TitleJob, Promise<void>>;
	closed: boolean;
}

const jobsByDatabase = new WeakMap<HostDb, TitleJobs>();

function getJobs(db: HostDb): TitleJobs {
	let jobs = jobsByDatabase.get(db);
	if (!jobs) {
		jobs = {
			pending: new Map(),
			followUps: new Map(),
			queue: [],
			active: new Map(),
			commits: new Map(),
			closed: false,
		};
		jobsByDatabase.set(db, jobs);
	}
	return jobs;
}

export function cancelWorkspaceTitleJob(db: HostDb, workspaceId: string): void {
	const jobs = jobsByDatabase.get(db);
	if (!jobs) return;
	const job = jobs.pending.get(workspaceId);
	jobs.pending.delete(workspaceId);
	jobs.followUps.delete(workspaceId);
	jobs.queue = jobs.queue.filter(
		(queued) => queued.workspaceId !== workspaceId,
	);
	job?.controller.abort();
}

export function hasWorkspaceTitleJob(db: HostDb, workspaceId: string): boolean {
	return jobsByDatabase.get(db)?.pending.has(workspaceId) ?? false;
}

export async function commitWorkspaceTitleJob(
	db: HostDb,
	workspaceId: string,
	run: () => Promise<void>,
): Promise<void> {
	const jobs = getJobs(db);
	const job = jobs.pending.get(workspaceId);
	if (jobs.closed || !job) return;
	const completion = Promise.resolve().then(run);
	jobs.commits.set(job, completion);
	try {
		await completion;
	} finally {
		jobs.commits.delete(job);
	}
}

export async function cancelAndWaitWorkspaceTitleCommit(
	db: HostDb,
	workspaceId: string,
): Promise<void> {
	cancelWorkspaceTitleJob(db, workspaceId);
	const jobs = jobsByDatabase.get(db);
	if (!jobs) return;
	await Promise.allSettled(
		[...jobs.commits]
			.filter(([job]) => job.workspaceId === workspaceId)
			.map(([, completion]) => completion),
	);
}

export async function disposeWorkspaceTitleJobs(
	db: HostDb,
	shutdownTimeoutMs = SHUTDOWN_TIMEOUT_MS,
): Promise<void> {
	const jobs = getJobs(db);
	jobs.closed = true;
	const cancelled = new Set([...jobs.pending.values(), ...jobs.active.keys()]);
	jobs.pending.clear();
	jobs.followUps.clear();
	jobs.queue = [];
	for (const job of cancelled) job.controller.abort();
	await Promise.allSettled(jobs.commits.values());
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			Promise.allSettled(jobs.active.values()),
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, shutdownTimeoutMs);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

/** A job queued while one is pending for the workspace runs after it, latest wins. */
export function queueWorkspaceTitleJob(
	db: HostDb,
	workspaceId: string,
	run: TitleJob["run"],
): void {
	const jobs = getJobs(db);
	if (jobs.closed) return;
	if (jobs.pending.has(workspaceId)) {
		jobs.followUps.set(workspaceId, run);
		return;
	}
	if (jobs.queue.length >= MAX_QUEUED) return;
	const job: TitleJob = { workspaceId, run, controller: new AbortController() };
	jobs.pending.set(workspaceId, job);
	jobs.queue.push(job);
	drain(db, jobs);
}

function drain(db: HostDb, jobs: TitleJobs): void {
	while (
		!jobs.closed &&
		jobs.active.size < MAX_RUNNING &&
		jobs.queue.length > 0
	) {
		const job = jobs.queue.shift();
		if (!job || jobs.pending.get(job.workspaceId) !== job) continue;
		const isCurrent = () =>
			!jobs.closed && jobs.pending.get(job.workspaceId) === job;
		const completion = Promise.resolve()
			.then(() => {
				if (isCurrent()) return job.run(isCurrent, job.controller.signal);
			})
			.catch((error) => {
				console.warn("[workspace-title] generation failed", error);
			})
			.finally(() => {
				jobs.active.delete(job);
				if (isCurrent()) {
					jobs.pending.delete(job.workspaceId);
					const followUp = jobs.followUps.get(job.workspaceId);
					jobs.followUps.delete(job.workspaceId);
					if (followUp) queueWorkspaceTitleJob(db, job.workspaceId, followUp);
				}
				drain(db, jobs);
			});
		jobs.active.set(job, completion);
	}
}
