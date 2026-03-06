/**
 * Git Worker Runtime
 *
 * Singleton worker pool for offloading heavy git reads from the main thread.
 * Used by tRPC routers via the convenience functions exported here.
 *
 * Feature flag: set SUPERSET_GIT_WORKER=0 to disable and fall back to
 * main-thread execution (default: enabled).
 */

import { join } from "node:path";
import { GitWorkerPool } from "./pool";
import type { GitTaskPayloads, GitTaskResults } from "./types";

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

const GIT_WORKER_ENABLED = process.env.SUPERSET_GIT_WORKER !== "0";

const GIT_WORKER_DEBUG = process.env.SUPERSET_GIT_WORKER_DEBUG === "1";

// ---------------------------------------------------------------------------
// Singleton pool
// ---------------------------------------------------------------------------

let pool: GitWorkerPool | null = null;

/**
 * Resolve the built worker script path.
 * In electron-vite builds, all main-process entry points are emitted
 * to the same output directory alongside the main index.js.
 */
function getWorkerScriptPath(): string {
	// __dirname points to dist/main/ in the built app
	return join(__dirname, "git-worker-thread.js");
}

function getPool(): GitWorkerPool {
	if (!pool) {
		pool = new GitWorkerPool(getWorkerScriptPath(), {
			maxWorkers: 2,
			maxQueueSize: 50,
			defaultTimeoutMs: 30_000,
			debug: GIT_WORKER_DEBUG,
		});
	}
	return pool;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isGitWorkerEnabled(): boolean {
	return GIT_WORKER_ENABLED;
}

/**
 * Submit a getStatus task to the worker pool.
 */
export function submitGetStatus(
	payload: GitTaskPayloads["getStatus"],
): Promise<GitTaskResults["getStatus"]> {
	return getPool().submit("getStatus", payload, {
		dedupeKey: `${payload.worktreePath}:${payload.defaultBranch}`,
		timeoutMs: 30_000,
	});
}

/**
 * Submit a getCommitFiles task to the worker pool.
 */
export function submitGetCommitFiles(
	payload: GitTaskPayloads["getCommitFiles"],
): Promise<GitTaskResults["getCommitFiles"]> {
	return getPool().submit("getCommitFiles", payload, {
		dedupeKey: `commitFiles:${payload.worktreePath}:${payload.commitHash}`,
		timeoutMs: 30_000,
	});
}

/**
 * Cancel pending git tasks for a given worktree path.
 * Call this on workspace switch or section collapse.
 */
export function cancelGitTasksForWorktree(worktreePath: string): void {
	if (!pool) return;
	pool.cancelByPrefix(worktreePath);
}

/**
 * Get current worker pool metrics for observability.
 */
export function getGitWorkerMetrics() {
	if (!pool) return null;
	return pool.getMetrics();
}

/**
 * Shut down the worker pool. Call on app quit.
 */
export async function destroyGitWorkerPool(): Promise<void> {
	if (pool) {
		await pool.destroy();
		pool = null;
	}
}
