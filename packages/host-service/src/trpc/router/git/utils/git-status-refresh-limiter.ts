import { cpus } from "node:os";

const DEFAULT_CONCURRENCY = Math.max(1, Math.min(4, cpus().length - 1));

export type GitStatusRefreshPriority = "foreground" | "background";

interface ActiveTask {
	requestKey: string;
	promise: Promise<unknown>;
}

interface QueuedTask {
	queueKey: string;
	requestKey: string;
	run: () => Promise<unknown>;
	promise: Promise<unknown>;
	resolve: (value: unknown) => void;
	reject: (reason: unknown) => void;
	priority: GitStatusRefreshPriority;
	sequence: number;
	generation: number;
}

interface CheckoutQueue {
	active: ActiveTask | null;
	queued: QueuedTask[];
}

// Per checkout, not per workspace: two repos of one workspace routinely share
// a base branch name, and keyed on the workspace alone their refreshes would
// coalesce into one whose result answers for both.
function queueKeyFor(workspaceId: string, repoKey: string | undefined): string {
	return `${workspaceId}\u0000${repoKey ?? ""}`;
}

export class GitStatusRefreshLimiter {
	private readonly concurrency: number;
	private readonly queues = new Map<string, CheckoutQueue>();
	private readonly readyQueue: QueuedTask[] = [];
	private activeCount = 0;
	private sequence = 0;
	private generation = 0;

	constructor(concurrency = DEFAULT_CONCURRENCY) {
		this.concurrency = Math.max(1, concurrency);
	}

	run<T>({
		workspaceId,
		repoKey,
		requestKey,
		run,
		priority = "foreground",
	}: {
		workspaceId: string;
		repoKey?: string;
		requestKey: string;
		run: () => Promise<T>;
		priority?: GitStatusRefreshPriority;
	}): Promise<T> {
		const queueKey = queueKeyFor(workspaceId, repoKey);
		const queue = this.getQueue(queueKey);

		// Collapse repeated invalidations while a workspace refresh is active into
		// one trailing refresh per request key. That keeps the final snapshot fresh
		// without letting fs-event churn enqueue unbounded git subprocess work.
		const queued = queue.queued.find((task) => task.requestKey === requestKey);
		if (queued) {
			this.promoteQueuedTask(queued, priority);
			return queued.promise as Promise<T>;
		}

		const task = this.createTask(queueKey, requestKey, run, priority);
		queue.queued.push(task);
		if (!queue.active && queue.queued[0] === task) {
			this.readyQueue.push(task);
			this.pump();
		}
		return task.promise as Promise<T>;
	}

	clear(): void {
		this.generation++;
		const queuedTasks = new Set<QueuedTask>();
		for (const queue of this.queues.values()) {
			for (const task of queue.queued) {
				queuedTasks.add(task);
			}
		}
		this.queues.clear();
		this.readyQueue.length = 0;
		this.activeCount = 0;
		for (const task of queuedTasks) {
			task.reject(new Error("Git status refresh queue was cleared"));
		}
	}

	private getQueue(queueKey: string): CheckoutQueue {
		let queue = this.queues.get(queueKey);
		if (!queue) {
			queue = { active: null, queued: [] };
			this.queues.set(queueKey, queue);
		}
		return queue;
	}

	private createTask<T>(
		queueKey: string,
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
			queueKey,
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

			const queue = this.queues.get(task.queueKey);
			if (!queue || queue.active || queue.queued[0] !== task) {
				continue;
			}

			this.startTask(queue, task);
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

	private startTask(queue: CheckoutQueue, task: QueuedTask): void {
		queue.queued.shift();
		queue.active = {
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
				if (queue.active?.promise === task.promise) {
					queue.active = null;
				}

				if (queue.queued.length > 0) {
					const next = queue.queued[0];
					if (next) this.readyQueue.push(next);
				} else if (!queue.active) {
					this.queues.delete(task.queueKey);
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
