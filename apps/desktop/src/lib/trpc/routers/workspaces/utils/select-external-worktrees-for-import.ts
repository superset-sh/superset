import type { ExternalWorktree } from "./git";

interface SelectArgs {
	mainRepoPath: string;
	trackedWorktrees: Array<{ path: string; branch: string }>;
	/** When provided, only worktrees whose path is in this set are returned. */
	requested?: Set<string>;
}

/**
 * Apply the same filter rules used when bulk-importing external worktrees:
 * skip the main repo, bare/detached worktrees, branch-less worktrees, and
 * anything already tracked in the local DB for the same path and branch. When
 * `requested` is provided, also skip worktrees not in that set.
 */
export function selectExternalWorktreesForImport(
	worktrees: ExternalWorktree[],
	{ mainRepoPath, trackedWorktrees, requested }: SelectArgs,
): ExternalWorktree[] {
	const trackedWorktreeKeys = new Set(
		trackedWorktrees.map((wt) => `${wt.path}\0${wt.branch}`),
	);

	return worktrees.filter((wt) => {
		if (requested && !requested.has(wt.path)) return false;
		if (wt.path === mainRepoPath) return false;
		if (wt.isBare) return false;
		if (wt.isDetached) return false;
		if (!wt.branch) return false;
		if (trackedWorktreeKeys.has(`${wt.path}\0${wt.branch}`)) return false;
		return true;
	});
}
