import { cpus } from "node:os";

const DEFAULT_CONCURRENCY = Math.max(1, Math.min(4, cpus().length - 1));

// Floor on how often a workspace can spawn a fresh `getGitStatusSnapshot`.
// Without this, sustained fs activity (e.g. git background writes during
// `git status` itself, build tools, language servers) keeps triggering
// `git:changed` invalidations and the limiter would start a new run the
// instant the previous one finished — producing several git subprocess
// bursts per second per worktree (#4937).
const DEFAULT_MIN_INTERVAL_MS = 1_000;

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
	lastStartedAt: number;
	cooldownTimer: ReturnType<typeof setTimeout> | null;
}

export interface GitStatusRefreshLimiterOptions {
	/**
	 * Minimum milliseconds between successive task starts for the same
	 * workspace. Measured start-to-start so slow git operations don't stack
	 * extra delay on top. Set to 0 to disable.
	 */
	minIntervalMs?: number;
}

export class GitStatusRefreshLimiter {
	private readonly concurrency: number;
	private readonly minIntervalMs: number;
	private readonly workspaces = new Map<string, WorkspaceQueue>();
	private readonly readyQueue: QueuedTask[] = [];
	private activeCount = 0;
	private sequence = 0;
	private generation = 0;

	constructor(
		concurrency = DEFAULT_CONCURRENCY,
		options: GitStatusRefreshLimiterOptions = {},
	) {
		this.concurrency = Math.max(1, concurrency);
		this.minIntervalMs = Math.max(0, options.minIntervalMs ?? 0);
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
			this.tryEnqueueReady(workspaceId, workspace);
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
			if (workspace.cooldownTimer) {
				clearTimeout(workspace.cooldownTimer);
				workspace.cooldownTimer = null;
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
			workspace = {
				active: null,
				queued: [],
				lastStartedAt: 0,
				cooldownTimer: null,
			};
			this.workspaces.set(workspaceId, workspace);
		}
		return workspace;
	}

	/**
	 * Push the workspace's head task onto the ready queue, or arm a cooldown
	 * timer that does so once `minIntervalMs` has elapsed since the last start.
	 */
	private tryEnqueueReady(
		workspaceId: string,
		workspace: WorkspaceQueue,
	): void {
		if (workspace.active) return;
		if (workspace.cooldownTimer) return;
		const head = workspace.queued[0];
		if (!head) return;

		const remaining =
			this.minIntervalMs > 0
				? workspace.lastStartedAt + this.minIntervalMs - Date.now()
				: 0;

		if (remaining <= 0) {
			this.readyQueue.push(head);
			this.pump();
			return;
		}

		this.armCooldownTimer(workspaceId, workspace, remaining);
	}

	/**
	 * Hold the workspace entry open for `delay` ms after a task starts so a
	 * burst of invalidations during the cooldown still enforces the rate
	 * limit instead of bypassing it through a fresh `lastStartedAt = 0`
	 * workspace entry.
	 */
	private armCooldownTimer(
		workspaceId: string,
		workspace: WorkspaceQueue,
		delay: number,
	): void {
		const timer = setTimeout(() => {
			workspace.cooldownTimer = null;
			if (workspace.active) return;
			const next = workspace.queued[0];
			if (next) {
				this.readyQueue.push(next);
				this.pump();
				return;
			}
			if (this.workspaces.get(workspaceId) === workspace) {
				this.workspaces.delete(workspaceId);
			}
		}, delay);
		timer.unref?.();
		workspace.cooldownTimer = timer;
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
		workspace.lastStartedAt = Date.now();
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
					this.tryEnqueueReady(task.workspaceId, workspace);
				} else if (this.minIntervalMs > 0 && !workspace.cooldownTimer) {
					// Hold the entry open until the cooldown window expires so a
					// new task arriving inside the window can't bypass the rate
					// limit by recreating a fresh workspace with lastStartedAt=0.
					const remaining =
						workspace.lastStartedAt + this.minIntervalMs - Date.now();
					if (remaining > 0) {
						this.armCooldownTimer(task.workspaceId, workspace, remaining);
					} else if (!workspace.active) {
						this.workspaces.delete(task.workspaceId);
					}
				} else if (!workspace.active && !workspace.cooldownTimer) {
					this.workspaces.delete(task.workspaceId);
				}

				this.pump();
			});
	}
}

export const gitStatusRefreshLimiter = new GitStatusRefreshLimiter(undefined, {
	minIntervalMs: DEFAULT_MIN_INTERVAL_MS,
});

function compareTaskPriority(a: QueuedTask, b: QueuedTask): number {
	if (a.priority !== b.priority) {
		return a.priority === "foreground" ? 1 : -1;
	}
	return b.sequence - a.sequence;
}
