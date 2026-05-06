import type { ExternalWorktree } from "./git";

interface SelectArgs {
	mainRepoPath: string;
	trackedPaths: Set<string>;
	/** When provided, only worktrees whose path is in this set are returned. */
	requested?: Set<string>;
}

/**
 * Apply the same filter rules used when bulk-importing external worktrees:
 * skip the main repo, bare/detached worktrees, branch-less worktrees, and
 * anything already tracked in the local DB. When `requested` is provided,
 * also skip worktrees not in that set.
 */
export function selectExternalWorktreesForImport(
	worktrees: ExternalWorktree[],
	{ mainRepoPath, trackedPaths, requested }: SelectArgs,
): ExternalWorktree[] {
	return worktrees.filter((wt) => {
		if (requested && !requested.has(wt.path)) return false;
		if (wt.path === mainRepoPath) return false;
		if (wt.isBare) return false;
		if (wt.isDetached) return false;
		if (!wt.branch) return false;
		if (trackedPaths.has(wt.path)) return false;
		return true;
	});
}
