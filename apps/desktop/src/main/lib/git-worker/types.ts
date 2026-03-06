/**
 * Git Worker Thread — Type Contracts
 *
 * Defines the typed task contracts and message protocol between
 * the main thread (pool) and the worker thread.
 */

import type { ChangedFile, GitChangesStatus } from "shared/changes-types";

// ---------------------------------------------------------------------------
// Task type registry
// ---------------------------------------------------------------------------

export type GitTaskType = "getStatus" | "getCommitFiles";

/** Payload per task type */
export interface GitTaskPayloads {
	getStatus: {
		worktreePath: string;
		defaultBranch: string;
	};
	getCommitFiles: {
		worktreePath: string;
		commitHash: string;
	};
}

/** Result per task type */
export interface GitTaskResults {
	getStatus: GitChangesStatus;
	getCommitFiles: ChangedFile[];
}

// ---------------------------------------------------------------------------
// Task descriptor (main → pool)
// ---------------------------------------------------------------------------

export interface GitTask<T extends GitTaskType = GitTaskType> {
	id: string;
	taskType: T;
	payload: GitTaskPayloads[T];
	dedupeKey: string;
	timeoutMs: number;
}

// ---------------------------------------------------------------------------
// Worker message protocol (main ↔ worker thread)
// ---------------------------------------------------------------------------

/** Main thread → worker */
export interface WorkerRequest {
	id: string;
	taskType: GitTaskType;
	payload: GitTaskPayloads[GitTaskType];
}

/** Worker → main thread (success) */
export interface WorkerSuccessResponse {
	id: string;
	ok: true;
	result: GitTaskResults[GitTaskType];
	durationMs: number;
}

/** Worker → main thread (error) */
export interface WorkerErrorResponse {
	id: string;
	ok: false;
	error: string;
	code?: string;
	durationMs: number;
}

export type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;

// ---------------------------------------------------------------------------
// Pool configuration
// ---------------------------------------------------------------------------

export interface GitWorkerPoolConfig {
	/** Max concurrent workers (default: 2) */
	maxWorkers: number;
	/** Max queued tasks before backpressure error (default: 50) */
	maxQueueSize: number;
	/** Default task timeout in ms (default: 30_000) */
	defaultTimeoutMs: number;
	/** Enable debug logging (default: false) */
	debug: boolean;
}

export const DEFAULT_POOL_CONFIG: GitWorkerPoolConfig = {
	maxWorkers: 2,
	maxQueueSize: 50,
	defaultTimeoutMs: 30_000,
	debug: false,
};

// ---------------------------------------------------------------------------
// Pool metrics (observability)
// ---------------------------------------------------------------------------

export interface GitWorkerMetrics {
	tasksSubmitted: number;
	tasksCompleted: number;
	tasksFailed: number;
	tasksTimedOut: number;
	tasksCoalesced: number;
	tasksCancelled: number;
	workerRestarts: number;
	currentQueueSize: number;
	currentActiveWorkers: number;
}
