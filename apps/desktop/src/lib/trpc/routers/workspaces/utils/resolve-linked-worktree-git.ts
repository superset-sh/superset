import path from "node:path";
import { getSimpleGitWithShellPath } from "./git-client";

export interface ResolvedLinkedWorktreeGit {
	/** Absolute path to the main repo root (parent of the shared .git dir). */
	mainRepoPath: string;
	/** Absolute path to the target's own worktree root. */
	toplevel: string;
	/** Current branch name of the target. */
	branch: string;
}

/**
 * Resolve a symlink target path to its git context. Returns null when the path
 * is not a usable git checkout to import (not a repo, bare, or detached HEAD).
 */
export async function resolveLinkedWorktreeGit(
	targetPath: string,
): Promise<ResolvedLinkedWorktreeGit | null> {
	try {
		const git = await getSimpleGitWithShellPath(targetPath);

		const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
		if (!branch || branch === "HEAD") return null; // unborn or detached

		const toplevel = (await git.revparse(["--show-toplevel"])).trim();
		if (!toplevel) return null;

		// --path-format=absolute so the common dir isn't relative to cwd.
		const commonDir = (
			await git.revparse(["--path-format=absolute", "--git-common-dir"])
		).trim();
		if (!commonDir) return null;

		// The shared git dir is "<mainRepoRoot>/.git"; the main repo root is its parent.
		const mainRepoPath = path.dirname(commonDir);

		return { mainRepoPath, toplevel, branch };
	} catch {
		return null;
	}
}
