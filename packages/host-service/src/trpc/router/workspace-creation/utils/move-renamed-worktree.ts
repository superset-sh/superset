import { sep } from "node:path";
import { createGitEnvResolver } from "../../../../runtime/git/git";
import type { HostServiceContext } from "../../../../types";
import { getHostWorkerPool } from "../../../../workers/host-worker-pool";
import { gitMoveWorktreeTask } from "../../../../workers/tasks/git";

const GIT_TASK_TIMEOUT_MS = 10_000;

/**
 * The directory a worktree created at `<root>/<branch>` takes after a branch
 * rename; null for a worktree placed anywhere else (adopted, custom path),
 * or when the rename changes the branch prefix: the links left at old paths
 * are found next to the worktree.
 */
export function renamedWorktreePath(
	worktreePath: string,
	oldBranch: string,
	newBranch: string,
): string | null {
	const prefix = (branch: string) =>
		branch.slice(0, branch.lastIndexOf("/") + 1);
	if (prefix(oldBranch) !== prefix(newBranch)) return null;
	const suffix = sep + oldBranch.split("/").join(sep);
	if (!worktreePath.endsWith(suffix)) return null;
	return (
		worktreePath.slice(0, -suffix.length) + sep + newBranch.split("/").join(sep)
	);
}

/** A mutable object so tests can patch the git step. */
export const worktreeMoveOps = {
	async moveWorktree(
		ctx: HostServiceContext,
		repoPath: string,
		from: string,
		to: string,
	): Promise<void> {
		const gitEnv = await createGitEnvResolver(ctx.credentials)(repoPath);
		await getHostWorkerPool().run(
			gitMoveWorktreeTask,
			{ repoPath, from, to, gitEnv },
			{ timeoutMs: GIT_TASK_TIMEOUT_MS },
		);
	},
};

export async function moveRenamedWorktree(
	ctx: HostServiceContext,
	input: {
		repoPath: string;
		worktreePath: string;
		oldBranch: string;
		newBranch: string;
	},
): Promise<string | null> {
	const to = renamedWorktreePath(
		input.worktreePath,
		input.oldBranch,
		input.newBranch,
	);
	if (!to) return null;
	try {
		await worktreeMoveOps.moveWorktree(
			ctx,
			input.repoPath,
			input.worktreePath,
			to,
		);
	} catch (error) {
		// Submodules, a lock, or a busy directory on Windows: the branch is
		// renamed and the directory keeps its old name.
		console.warn("[worktree-move] worktree move failed", error);
		return null;
	}
	ctx.runtime.filesystem.forgetRoot(input.worktreePath);
	return to;
}
