import { EventEmitter } from "node:events";
import type {
	WorkspaceInitProgress,
	WorkspaceInitStep,
} from "shared/types/workspace-init";

interface InitJob {
	workspaceId: string;
	projectId: string;
	progress: WorkspaceInitProgress;
	cancelled: boolean;
	worktreeCreated: boolean; // Track for cleanup on failure
}

/**
 * Manages workspace initialization jobs with:
 * - Progress tracking and streaming via EventEmitter
 * - Cancellation support
 * - Per-project mutex to prevent concurrent git operations
 *
 * This is an in-memory manager - state is NOT persisted across app restarts.
 * If the app restarts during initialization, the workspace may be left in
 * an incomplete state requiring manual cleanup (documented limitation).
 */
class WorkspaceInitManager extends EventEmitter {
	private jobs = new Map<string, InitJob>();
	private projectLocks = new Map<string, Promise<void>>();
	private projectLockResolvers = new Map<string, () => void>();

	// Coordination state that persists even after job progress is cleared
	private donePromises = new Map<string, Promise<void>>();
	private doneResolvers = new Map<string, () => void>();
	private cancellations = new Set<string>();

	/**
	 * Check if a workspace is currently initializing
	 */
	isInitializing(workspaceId: string): boolean {
		const job = this.jobs.get(workspaceId);
		return (
			job !== undefined &&
			job.progress.step !== "ready" &&
			job.progress.step !== "failed"
		);
	}

	/**
	 * Check if a workspace has failed initialization
	 */
	hasFailed(workspaceId: string): boolean {
		const job = this.jobs.get(workspaceId);
		return job?.progress.step === "failed";
	}

	/**
	 * Get current progress for a workspace
	 */
	getProgress(workspaceId: string): WorkspaceInitProgress | undefined {
		return this.jobs.get(workspaceId)?.progress;
	}

	/**
	 * Get all workspaces currently initializing or failed
	 */
	getAllProgress(): WorkspaceInitProgress[] {
		return Array.from(this.jobs.values()).map((job) => job.progress);
	}

	/**
	 * Start tracking a new initialization job
	 */
	startJob(workspaceId: string, projectId: string): void {
		if (this.jobs.has(workspaceId)) {
			console.warn(
				`[workspace-init] Job already exists for ${workspaceId}, clearing old job`,
			);
			this.jobs.delete(workspaceId);
		}

		// Clear any stale cancellation state from previous attempt
		this.cancellations.delete(workspaceId);

		// Create done promise for coordination (allows delete to wait for init completion)
		let resolve: () => void;
		const promise = new Promise<void>((r) => {
			resolve = r;
		});
		this.donePromises.set(workspaceId, promise);
		// biome-ignore lint/style/noNonNullAssertion: resolve is assigned in Promise constructor
		this.doneResolvers.set(workspaceId, resolve!);

		const progress: WorkspaceInitProgress = {
			workspaceId,
			projectId,
			step: "pending",
			message: "Preparing...",
		};

		this.jobs.set(workspaceId, {
			workspaceId,
			projectId,
			progress,
			cancelled: false,
			worktreeCreated: false,
		});

		this.emit("progress", progress);
	}

	/**
	 * Update progress for an initialization job
	 */
	updateProgress(
		workspaceId: string,
		step: WorkspaceInitStep,
		message: string,
		error?: string,
	): void {
		const job = this.jobs.get(workspaceId);
		if (!job) {
			console.warn(`[workspace-init] No job found for ${workspaceId}`);
			return;
		}

		job.progress = {
			...job.progress,
			step,
			message,
			error,
		};

		this.emit("progress", job.progress);

		// Clean up ready jobs after a delay
		if (step === "ready") {
			setTimeout(() => {
				if (this.jobs.get(workspaceId)?.progress.step === "ready") {
					this.jobs.delete(workspaceId);
				}
			}, 2000);
		}
	}

	/**
	 * Mark that the worktree has been created (for cleanup tracking)
	 */
	markWorktreeCreated(workspaceId: string): void {
		const job = this.jobs.get(workspaceId);
		if (job) {
			job.worktreeCreated = true;
		}
	}

	/**
	 * Check if worktree was created (for cleanup decisions)
	 */
	wasWorktreeCreated(workspaceId: string): boolean {
		return this.jobs.get(workspaceId)?.worktreeCreated ?? false;
	}

	/**
	 * Cancel an initialization job.
	 * Sets cancellation flag on job (if exists) AND adds to cancellations Set.
	 * The Set persists even after job is cleared, preventing the race where
	 * clearJob() removes the cancellation signal before init can observe it.
	 */
	cancel(workspaceId: string): void {
		// Add to durable cancellations set (survives clearJob)
		this.cancellations.add(workspaceId);

		const job = this.jobs.get(workspaceId);
		if (job) {
			job.cancelled = true;
		}
		console.log(`[workspace-init] Cancelled job for ${workspaceId}`);
	}

	/**
	 * Check if a job has been cancelled (legacy - checks job record only).
	 * @deprecated Use isCancellationRequested() for race-safe cancellation checks.
	 */
	isCancelled(workspaceId: string): boolean {
		return this.jobs.get(workspaceId)?.cancelled ?? false;
	}

	/**
	 * Check if cancellation has been requested for a workspace.
	 * This checks the durable cancellations Set, which persists even after
	 * the job record is cleared. Use this in init flow for race-safe checks.
	 */
	isCancellationRequested(workspaceId: string): boolean {
		return this.cancellations.has(workspaceId);
	}

	/**
	 * Clear a job (called before retry or after delete).
	 * Also cleans up coordination state (done promise, cancellation).
	 */
	clearJob(workspaceId: string): void {
		this.jobs.delete(workspaceId);
		this.donePromises.delete(workspaceId);
		this.doneResolvers.delete(workspaceId);
		this.cancellations.delete(workspaceId);
	}

	/**
	 * Finalize a job, resolving the done promise and cleaning up coordination state.
	 * MUST be called in all init exit paths (success, failure, cancellation).
	 * This allows waitForInit() to unblock.
	 */
	finalizeJob(workspaceId: string): void {
		const resolve = this.doneResolvers.get(workspaceId);
		if (resolve) {
			resolve();
			console.log(`[workspace-init] Finalized job for ${workspaceId}`);
		}

		// Clean up coordination state to prevent memory leaks
		// This is safe because waitForInit() either:
		// 1. Already resolved (promise completed)
		// 2. Will return immediately (promise no longer in map)
		this.donePromises.delete(workspaceId);
		this.doneResolvers.delete(workspaceId);
		// Note: Don't clear cancellations here - clearJob handles that
		// to allow cancellation signal to persist through async cleanup
	}

	/**
	 * Wait for an init job to complete (success, failure, or cancellation).
	 * Returns immediately if no init is in progress.
	 *
	 * @param workspaceId - The workspace to wait for
	 * @param timeoutMs - Maximum time to wait (default 30s). On timeout, returns without error.
	 */
	async waitForInit(workspaceId: string, timeoutMs = 30000): Promise<void> {
		const promise = this.donePromises.get(workspaceId);
		if (!promise) {
			// No init in progress or already completed
			return;
		}

		console.log(
			`[workspace-init] Waiting for init to complete: ${workspaceId}`,
		);

		await Promise.race([
			promise,
			new Promise<void>((resolve) => {
				setTimeout(() => {
					console.warn(
						`[workspace-init] Wait timed out after ${timeoutMs}ms for ${workspaceId}`,
					);
					resolve();
				}, timeoutMs);
			}),
		]);
	}

	/**
	 * Acquire per-project lock for git operations.
	 * Only one git operation per project at a time.
	 * This prevents race conditions and git lock conflicts.
	 */
	async acquireProjectLock(projectId: string): Promise<void> {
		// Wait for any existing lock to be released
		while (this.projectLocks.has(projectId)) {
			await this.projectLocks.get(projectId);
		}

		// Create a new lock
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
	 * Check if a project has an active lock
	 */
	hasProjectLock(projectId: string): boolean {
		return this.projectLocks.has(projectId);
	}
}

/** Singleton workspace initialization manager instance */
export const workspaceInitManager = new WorkspaceInitManager();
