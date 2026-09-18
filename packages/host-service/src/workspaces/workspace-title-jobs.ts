import type { HostDb } from "../db";

const MAX_RUNNING = 2;
const MAX_QUEUED = 32;
const MAX_WAITING = 32;
const SHUTDOWN_TIMEOUT_MS = 1_000;

interface TitleJob {
	workspaceId: string;
	controller: AbortController;
	cancelWait?: () => void;
	run: (isCurrent: () => boolean, signal: AbortSignal) => Promise<void>;
}

interface TitleJobs {
	pending: Map<string, TitleJob>;
	waiting: Set<TitleJob>;
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
			waiting: new Set(),
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
	if (job) jobs.waiting.delete(job);
	jobs.queue = jobs.queue.filter(
		(queued) => queued.workspaceId !== workspaceId,
	);
	job?.cancelWait?.();
	job?.controller.abort();
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

export async function disposeWorkspaceTitleJobs(db: HostDb): Promise<void> {
	const jobs = getJobs(db);
	jobs.closed = true;
	const cancelled = new Set([...jobs.pending.values(), ...jobs.active.keys()]);
	jobs.pending.clear();
	jobs.waiting.clear();
	jobs.queue = [];
	for (const job of cancelled) {
		job.cancelWait?.();
		job.controller.abort();
	}
	await Promise.allSettled(jobs.commits.values());
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			Promise.allSettled(jobs.active.values()),
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, SHUTDOWN_TIMEOUT_MS);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

export function queueWorkspaceTitleJob(
	db: HostDb,
	workspaceId: string,
	run: TitleJob["run"],
	waitForStart?: (start: () => void) => () => void,
): void {
	const jobs = getJobs(db);
	if (jobs.closed || jobs.pending.has(workspaceId)) return;
	if (waitForStart && jobs.waiting.size >= MAX_WAITING) {
		const oldest = jobs.waiting.values().next().value;
		if (oldest) cancelWorkspaceTitleJob(db, oldest.workspaceId);
	}
	const job: TitleJob = { workspaceId, run, controller: new AbortController() };
	jobs.pending.set(workspaceId, job);
	let started = false;
	const start = () => {
		if (started || jobs.closed || jobs.pending.get(workspaceId) !== job) return;
		started = true;
		jobs.waiting.delete(job);
		job.cancelWait?.();
		job.cancelWait = undefined;
		if (jobs.queue.length >= MAX_QUEUED) {
			cancelWorkspaceTitleJob(db, workspaceId);
			return;
		}
		jobs.queue.push(job);
		drain(jobs);
	};
	if (waitForStart) {
		jobs.waiting.add(job);
		const cancelWait = waitForStart(start);
		if (started || job.controller.signal.aborted) cancelWait();
		else job.cancelWait = cancelWait;
	} else start();
}

function drain(jobs: TitleJobs): void {
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
				if (isCurrent()) jobs.pending.delete(job.workspaceId);
				drain(jobs);
			});
		jobs.active.set(job, completion);
	}
}
