// Off-loop git operations for the workspace-delete saga. Env resolution
// stays on the event loop (it needs the credential provider); the git
// subprocesses — status preflight, `worktree remove` (a recursive delete
// of the whole worktree), branch delete — run in the host worker pool.
//
// Exported as a mutable object: the unit tests patch these methods per
// test and restore them (bun's mock.module leaks across test files in the
// same process, so a module mock would poison the integration suite).

import { createGitEnvResolver } from "../../../runtime/git/git";
import type { HostServiceContext } from "../../../types";
import { getHostWorkerPool } from "../../../workers/host-worker-pool";
import {
	type GitTaskEnv,
	gitDeleteBranchTask,
	gitWorktreeRemoveTask,
	gitWorktreeStateTask,
} from "../../../workers/tasks/git";
import {
	WorkerTaskAbortedError,
	WorkerTaskError,
} from "../../../workers/WorkerTaskRunner";

/**
 * Pool-infrastructure failure (timeout, queue rejection, abort) — the git
 * result is UNKNOWN, unlike a git error thrown by the task handler itself
 * (whose original `name` — e.g. GitError — is preserved across the worker
 * boundary). The destroy preflight fails closed on these instead of
 * proceeding without its dirty-worktree check.
 */
export function isIndeterminateGitTaskFailure(err: unknown): boolean {
	if (err instanceof WorkerTaskAbortedError) return true;
	return err instanceof WorkerTaskError && err.name === "WorkerTaskError";
}

export const cleanupGitOps = {
	/** Same failure surface as `ctx.git(repoPath)` — a throw here maps to the
	 * saga's "failed to open project repo" handling. */
	resolveGitEnv(
		ctx: Pick<HostServiceContext, "credentials">,
		repoPath: string,
	): Promise<GitTaskEnv> {
		return createGitEnvResolver(ctx.credentials)(repoPath);
	},

	readWorktreeState(
		input: {
			worktreePath: string;
			gitEnv: GitTaskEnv;
			ignoreInitialCommit?: boolean;
		},
		signal?: AbortSignal,
	): Promise<{ hasChanges: boolean; hasUnpushedCommits: boolean }> {
		return getHostWorkerPool().run(gitWorktreeStateTask, input, {
			timeoutMs: 15_000,
			signal,
		});
	},

	removeWorktree(input: {
		repoPath: string;
		worktreePath: string;
		gitEnv: GitTaskEnv;
	}): Promise<{ stillRegistered: boolean; removeError?: string }> {
		// Generous timeout: removal recursively deletes the worktree
		// directory, which can take a while for large trees (node_modules
		// etc.).
		return getHostWorkerPool().run(gitWorktreeRemoveTask, input, {
			timeoutMs: 120_000,
		});
	},

	deleteLocalBranch(input: {
		repoPath: string;
		branch: string;
		gitEnv: GitTaskEnv;
	}): Promise<{ deleted: boolean }> {
		return getHostWorkerPool().run(gitDeleteBranchTask, input);
	},
};
