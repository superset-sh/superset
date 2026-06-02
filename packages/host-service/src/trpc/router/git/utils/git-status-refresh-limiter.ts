import { cpus } from "node:os";

const DEFAULT_CONCURRENCY = Math.max(1, Math.min(4, cpus().length - 1));

export type GitStatusRefreshPriority = "foreground" | "background";

interface ActiveTask {
	requestKey: string;
	promise: Promise<unknown>;
}

interface QueuedTask {
	workspaceId: string;
	requestKey: string;
	run: () => Promise<unknown>;
	promise: Promise<unknown>;
	resolve: (value: unknown) => void;
	reject: (reason: unknown) => void;
	priority: GitStatusRefreshPriority;
	sequence: number;
	generation: number;
}

interface WorkspaceQueue {
	active: ActiveTask | null;
	queued: QueuedTask[];
}

export class GitStatusRefreshLimiter {
	private readonly concurrency: number;
	private readonly workspaces = new Map<string, WorkspaceQueue>();
	private readonly readyQueue: QueuedTask[] = [];
	private activeCount = 0;
	private sequence = 0;
	private generation = 0;

	constructor(concurrency = DEFAULT_CONCURRENCY) {
		this.concurrency = Math.max(1, concurrency);
	}

	run<T>({
		workspaceId,
		requestKey,
		run,
		priority = "foreground",
	}: {
		workspaceId: string;
		requestKey: string;
		run: () => Promise<T>;
		priority?: GitStatusRefreshPriority;
	}): Promise<T> {
		const workspace = this.getWorkspaceQueue(workspaceId);

		// Collapse repeated invalidations while a workspace refresh is active into
		// one trailing refresh per request key. That keeps the final snapshot fresh
		// without letting fs-event churn enqueue unbounded git subprocess work.
		const queued = workspace.queued.find(
			(task) => task.requestKey === requestKey,
		);
		if (queued) {
			this.promoteQueuedTask(queued, priority);
			return queued.promise as Promise<T>;
		}

		const task = this.createTask(workspaceId, requestKey, run, priority);
		workspace.queued.push(task);
		if (!workspace.active && workspace.queued[0] === task) {
			this.readyQueue.push(task);
			this.pump();
		}
		return task.promise as Promise<T>;
	}

	clear(): void {
		this.generation++;
		const queuedTasks = new Set<QueuedTask>();
		for (const workspace of this.workspaces.values()) {
			for (const task of workspace.queued) {
				queuedTasks.add(task);
			}
		}
		this.workspaces.clear();
		this.readyQueue.length = 0;
		this.activeCount = 0;
		for (const task of queuedTasks) {
			task.reject(new Error("Git status refresh queue was cleared"));
		}
	}

	private getWorkspaceQueue(workspaceId: string): WorkspaceQueue {
		let workspace = this.workspaces.get(workspaceId);
		if (!workspace) {
			workspace = { active: null, queued: [] };
			this.workspaces.set(workspaceId, workspace);
		}
		return workspace;
	}

	private createTask<T>(
		workspaceId: string,
		requestKey: string,
		run: () => Promise<T>,
		priority: GitStatusRefreshPriority,
	): QueuedTask {
		let resolve: (value: unknown) => void = () => {};
		let reject: (reason: unknown) => void = () => {};
		const promise = new Promise<unknown>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		return {
			workspaceId,
			requestKey,
			run,
			promise,
			resolve,
			reject,
			priority,
			sequence: ++this.sequence,
			generation: this.generation,
		};
	}

	private promoteQueuedTask(
		task: QueuedTask,
		priority: GitStatusRefreshPriority,
	): void {
		if (priority === "foreground" && task.priority === "background") {
			task.priority = "foreground";
		}
		task.sequence = ++this.sequence;
	}

	private pump(): void {
		while (this.activeCount < this.concurrency && this.readyQueue.length > 0) {
			const task = this.takeNextReadyTask();
			if (!task) return;
			if (task.generation !== this.generation) continue;

			const workspace = this.workspaces.get(task.workspaceId);
			if (!workspace || workspace.active || workspace.queued[0] !== task) {
				continue;
			}

			this.startTask(workspace, task);
		}
	}

	private takeNextReadyTask(): QueuedTask | undefined {
		let bestIndex = -1;
		let bestTask: QueuedTask | undefined;

		for (let index = 0; index < this.readyQueue.length; index++) {
			const task = this.readyQueue[index];
			if (!task) continue;
			if (!bestTask || compareTaskPriority(task, bestTask) > 0) {
				bestTask = task;
				bestIndex = index;
			}
		}

		if (bestIndex < 0) return undefined;
		this.readyQueue.splice(bestIndex, 1);
		return bestTask;
	}

	private startTask(workspace: WorkspaceQueue, task: QueuedTask): void {
		workspace.queued.shift();
		workspace.active = {
			requestKey: task.requestKey,
			promise: task.promise,
		};
		this.activeCount++;

		void Promise.resolve()
			.then(task.run)
			.then(task.resolve, task.reject)
			.finally(() => {
				if (task.generation !== this.generation) return;
				this.activeCount--;
				if (workspace.active?.promise === task.promise) {
					workspace.active = null;
				}

				if (workspace.queued.length > 0) {
					const next = workspace.queued[0];
					if (next) this.readyQueue.push(next);
				} else if (!workspace.active) {
					this.workspaces.delete(task.workspaceId);
				}

				this.pump();
			});
	}
}

export const gitStatusRefreshLimiter = new GitStatusRefreshLimiter();

function compareTaskPriority(a: QueuedTask, b: QueuedTask): number {
	if (a.priority !== b.priority) {
		return a.priority === "foreground" ? 1 : -1;
	}
	return b.sequence - a.sequence;
}
