import { EventEmitter } from "node:events";
import type { SelectPlanTask } from "@superset/local-db";

export type TaskExecutionStatus =
	| "pending"
	| "initializing"
	| "creating_worktree"
	| "running"
	| "paused"
	| "completed"
	| "failed"
	| "cancelled";

export interface TaskExecutionProgress {
	taskId: string;
	planId: string;
	projectId: string;
	status: TaskExecutionStatus;
	message: string;
	error?: string;
	worktreeId?: string;
	workspaceId?: string;
	startedAt?: number;
	completedAt?: number;
}

export interface TaskExecutionOutput {
	taskId: string;
	type: "output" | "tool_use" | "error" | "progress";
	content: string;
	timestamp: number;
}

interface ExecutionJob {
	taskId: string;
	planId: string;
	projectId: string;
	task: SelectPlanTask;
	progress: TaskExecutionProgress;
	cancelled: boolean;
	abortController: AbortController;
	worktreeCreated: boolean;
	worktreePath?: string;
	mainRepoPath?: string;
}

/**
 * Manages task execution jobs with:
 * - Progress tracking and streaming via EventEmitter
 * - Cancellation support via AbortController
 * - Per-project mutex to prevent concurrent git operations
 * - Configurable concurrency limits
 *
 * This is an in-memory manager - state is NOT persisted across app restarts.
 * Running tasks will be lost if the app restarts (documented limitation).
 */
class TaskExecutionManager extends EventEmitter {
	private jobs = new Map<string, ExecutionJob>();
	private projectLocks = new Map<string, Promise<void>>();
	private projectLockResolvers = new Map<string, () => void>();
	private maxConcurrent = 10;
	private runningCount = 0;
	private queue: string[] = [];

	/**
	 * Set maximum concurrent task executions
	 */
	setMaxConcurrent(count: number): void {
		this.maxConcurrent = Math.max(1, count);
	}

	/**
	 * Get maximum concurrent task executions
	 */
	getMaxConcurrent(): number {
		return this.maxConcurrent;
	}

	/**
	 * Check if a task is currently being executed
	 */
	isExecuting(taskId: string): boolean {
		const job = this.jobs.get(taskId);
		return (
			job !== undefined &&
			job.progress.status !== "completed" &&
			job.progress.status !== "failed" &&
			job.progress.status !== "cancelled"
		);
	}

	/**
	 * Check if a task has failed
	 */
	hasFailed(taskId: string): boolean {
		const job = this.jobs.get(taskId);
		return job?.progress.status === "failed";
	}

	/**
	 * Get current progress for a task
	 */
	getProgress(taskId: string): TaskExecutionProgress | undefined {
		return this.jobs.get(taskId)?.progress;
	}

	/**
	 * Get all tasks currently being executed
	 */
	getAllProgress(): TaskExecutionProgress[] {
		return Array.from(this.jobs.values()).map((job) => job.progress);
	}

	/**
	 * Get all running tasks
	 */
	getRunningTasks(): TaskExecutionProgress[] {
		return Array.from(this.jobs.values())
			.filter((job) => job.progress.status === "running")
			.map((job) => job.progress);
	}

	/**
	 * Get all queued tasks
	 */
	getQueuedTasks(): string[] {
		return [...this.queue];
	}

	/**
	 * Enqueue a task for execution
	 * Returns immediately - use events to track progress
	 */
	enqueue(task: SelectPlanTask, projectId: string, mainRepoPath: string): void {
		if (this.jobs.has(task.id)) {
			console.warn(
				`[task-execution] Task ${task.id} already queued/running, skipping`,
			);
			return;
		}

		const progress: TaskExecutionProgress = {
			taskId: task.id,
			planId: task.planId,
			projectId,
			status: "pending",
			message: "Queued for execution...",
		};

		this.jobs.set(task.id, {
			taskId: task.id,
			planId: task.planId,
			projectId,
			task,
			progress,
			cancelled: false,
			abortController: new AbortController(),
			worktreeCreated: false,
			mainRepoPath,
		});

		this.queue.push(task.id);
		this.emit("progress", progress);
		this.processQueue();
	}

	/**
	 * Process the queue - start tasks up to concurrency limit
	 */
	private processQueue(): void {
		while (this.runningCount < this.maxConcurrent && this.queue.length > 0) {
			const taskId = this.queue.shift();
			if (taskId) {
				this.startExecution(taskId);
			}
		}
	}

	/**
	 * Start executing a task (internal)
	 */
	private async startExecution(taskId: string): Promise<void> {
		const job = this.jobs.get(taskId);
		if (!job) {
			console.warn(`[task-execution] Job ${taskId} not found`);
			return;
		}

		this.runningCount++;
		this.updateProgress(taskId, "initializing", "Initializing task...");

		try {
			// Import dynamically to avoid circular dependencies
			const { executeTask } = await import("./executor");
			await executeTask(job, this);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error(`[task-execution] Task ${taskId} failed:`, errorMessage);
			this.updateProgress(taskId, "failed", "Execution failed", errorMessage);
		} finally {
			this.runningCount--;
			this.processQueue();
		}
	}

	/**
	 * Update progress for a task execution
	 */
	updateProgress(
		taskId: string,
		status: TaskExecutionStatus,
		message: string,
		error?: string,
	): void {
		const job = this.jobs.get(taskId);
		if (!job) {
			console.warn(`[task-execution] No job found for ${taskId}`);
			return;
		}

		const now = Date.now();
		job.progress = {
			...job.progress,
			status,
			message,
			error,
			startedAt: job.progress.startedAt ?? (status === "running" ? now : undefined),
			completedAt:
				status === "completed" || status === "failed" || status === "cancelled"
					? now
					: undefined,
		};

		this.emit("progress", job.progress);

		// Clean up completed/failed/cancelled jobs after a delay
		if (
			status === "completed" ||
			status === "failed" ||
			status === "cancelled"
		) {
			setTimeout(() => {
				const currentJob = this.jobs.get(taskId);
				if (
					currentJob &&
					(currentJob.progress.status === "completed" ||
						currentJob.progress.status === "failed" ||
						currentJob.progress.status === "cancelled")
				) {
					this.jobs.delete(taskId);
				}
			}, 30000); // Keep for 30s for UI to show final state
		}
	}

	/**
	 * Emit output from task execution
	 */
	emitOutput(output: TaskExecutionOutput): void {
		this.emit("output", output);
		this.emit(`output:${output.taskId}`, output);
	}

	/**
	 * Mark that a worktree has been created for a task
	 */
	markWorktreeCreated(
		taskId: string,
		worktreePath: string,
		worktreeId: string,
		workspaceId: string,
	): void {
		const job = this.jobs.get(taskId);
		if (job) {
			job.worktreeCreated = true;
			job.worktreePath = worktreePath;
			job.progress.worktreeId = worktreeId;
			job.progress.workspaceId = workspaceId;
		}
	}

	/**
	 * Get worktree info for a task
	 */
	getWorktreeInfo(taskId: string): {
		created: boolean;
		path?: string;
		worktreeId?: string;
		workspaceId?: string;
	} {
		const job = this.jobs.get(taskId);
		return {
			created: job?.worktreeCreated ?? false,
			path: job?.worktreePath,
			worktreeId: job?.progress.worktreeId,
			workspaceId: job?.progress.workspaceId,
		};
	}

	/**
	 * Cancel a task execution
	 */
	cancel(taskId: string): void {
		const job = this.jobs.get(taskId);
		if (job) {
			job.cancelled = true;
			job.abortController.abort();
			this.updateProgress(taskId, "cancelled", "Task cancelled by user");
		}

		// Remove from queue if still queued
		const queueIndex = this.queue.indexOf(taskId);
		if (queueIndex !== -1) {
			this.queue.splice(queueIndex, 1);
		}
	}

	/**
	 * Check if a task has been cancelled
	 */
	isCancelled(taskId: string): boolean {
		return this.jobs.get(taskId)?.cancelled ?? false;
	}

	/**
	 * Get abort signal for a task
	 */
	getAbortSignal(taskId: string): AbortSignal | undefined {
		return this.jobs.get(taskId)?.abortController.signal;
	}

	/**
	 * Get the job for a task (internal use)
	 */
	getJob(taskId: string): ExecutionJob | undefined {
		return this.jobs.get(taskId);
	}

	/**
	 * Pause a running task
	 */
	pause(taskId: string): void {
		const job = this.jobs.get(taskId);
		if (job && job.progress.status === "running") {
			this.updateProgress(taskId, "paused", "Task paused");
		}
	}

	/**
	 * Resume a paused task
	 */
	resume(taskId: string): void {
		const job = this.jobs.get(taskId);
		if (job && job.progress.status === "paused") {
			this.updateProgress(taskId, "running", "Task resumed");
		}
	}

	/**
	 * Acquire per-project lock for git operations.
	 * Only one git operation per project at a time.
	 * This prevents race conditions and git lock conflicts.
	 */
	async acquireProjectLock(projectId: string): Promise<void> {
		while (this.projectLocks.has(projectId)) {
			await this.projectLocks.get(projectId);
		}

		let resolve: () => void;
		const promise = new Promise<void>((r) => {
			resolve = r;
		});

		this.projectLocks.set(projectId, promise);
		// biome-ignore lint/style/noNonNullAssertion: resolve is assigned in Promise constructor
		this.projectLockResolvers.set(projectId, resolve!);
	}

	/**
	 * Release per-project lock
	 */
	releaseProjectLock(projectId: string): void {
		const resolve = this.projectLockResolvers.get(projectId);
		if (resolve) {
			this.projectLocks.delete(projectId);
			this.projectLockResolvers.delete(projectId);
			resolve();
		}
	}

	/**
	 * Stop all running tasks (for app shutdown)
	 */
	async stopAll(): Promise<void> {
		const runningJobs = Array.from(this.jobs.values()).filter(
			(job) =>
				job.progress.status === "running" ||
				job.progress.status === "initializing" ||
				job.progress.status === "creating_worktree",
		);

		for (const job of runningJobs) {
			this.cancel(job.taskId);
		}

		// Clear the queue
		this.queue.length = 0;
	}

	/**
	 * Get execution statistics
	 */
	getStats(): {
		running: number;
		queued: number;
		completed: number;
		failed: number;
		maxConcurrent: number;
	} {
		const jobs = Array.from(this.jobs.values());
		return {
			running: jobs.filter((j) => j.progress.status === "running").length,
			queued: this.queue.length,
			completed: jobs.filter((j) => j.progress.status === "completed").length,
			failed: jobs.filter((j) => j.progress.status === "failed").length,
			maxConcurrent: this.maxConcurrent,
		};
	}
}

/** Singleton task execution manager instance */
export const taskExecutionManager = new TaskExecutionManager();
