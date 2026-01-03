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
	 * Cancel an initialization job
	 */
	cancel(workspaceId: string): void {
		const job = this.jobs.get(workspaceId);
		if (job) {
			job.cancelled = true;
			console.log(`[workspace-init] Cancelled job for ${workspaceId}`);
		}
	}

	/**
	 * Check if a job has been cancelled
	 */
	isCancelled(workspaceId: string): boolean {
		return this.jobs.get(workspaceId)?.cancelled ?? false;
	}

	/**
	 * Clear a job (called before retry or after delete)
	 */
	clearJob(workspaceId: string): void {
		this.jobs.delete(workspaceId);
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
