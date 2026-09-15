import type { HostDb } from "../db";

const MAX_RUNNING = 2;
const MAX_QUEUED = 32;

interface TitleJob {
	workspaceId: string;
	run: (isCurrent: () => boolean) => Promise<void>;
}

interface TitleJobs {
	pending: Map<string, TitleJob>;
	queue: TitleJob[];
	running: number;
}

const jobsByDatabase = new WeakMap<HostDb, TitleJobs>();

export function cancelWorkspaceTitleJob(db: HostDb, workspaceId: string): void {
	const jobs = jobsByDatabase.get(db);
	if (!jobs) return;
	jobs.pending.delete(workspaceId);
	jobs.queue = jobs.queue.filter((job) => job.workspaceId !== workspaceId);
}

export function queueWorkspaceTitleJob(
	db: HostDb,
	workspaceId: string,
	run: TitleJob["run"],
): void {
	let jobs = jobsByDatabase.get(db);
	if (!jobs) {
		jobs = { pending: new Map(), queue: [], running: 0 };
		jobsByDatabase.set(db, jobs);
	}
	if (jobs.pending.has(workspaceId) || jobs.queue.length >= MAX_QUEUED) return;
	const job = { workspaceId, run };
	jobs.pending.set(workspaceId, job);
	jobs.queue.push(job);
	drain(jobs);
}

function drain(jobs: TitleJobs): void {
	while (jobs.running < MAX_RUNNING && jobs.queue.length > 0) {
		const job = jobs.queue.shift();
		if (!job || jobs.pending.get(job.workspaceId) !== job) continue;
		jobs.running++;
		const isCurrent = () => jobs.pending.get(job.workspaceId) === job;
		void Promise.resolve()
			.then(() => {
				if (isCurrent()) return job.run(isCurrent);
			})
			.catch((error) => {
				console.warn("[workspace-title] generation failed", error);
			})
			.finally(() => {
				jobs.running--;
				if (isCurrent()) jobs.pending.delete(job.workspaceId);
				drain(jobs);
			});
	}
}
