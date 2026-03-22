export interface TrackedWorktree {
	id: string;
	branch: string;
	path: string;
	hasActiveWorkspace: boolean;
	existsOnDisk: boolean;
}

export interface ExternalWorktree {
	path: string;
	branch: string;
}

export type OpenableWorktreeAction =
	| { type: "tracked"; worktreeId: string }
	| { type: "external"; worktreePath: string; branch: string };

/**
 * Given tracked and external worktrees, builds a map from branch name to the
 * action needed to open that worktree. Only worktrees that exist on disk and
 * do NOT already have an active workspace are included (those with active
 * workspaces are already open and don't need reopening).
 *
 * Tracked worktrees take priority over external ones for the same branch.
 */
export function resolveOpenableWorktrees(
	trackedWorktrees: TrackedWorktree[],
	externalWorktrees: ExternalWorktree[],
): Map<string, OpenableWorktreeAction> {
	const result = new Map<string, OpenableWorktreeAction>();

	// External worktrees first (lower priority — tracked overrides)
	for (const wt of externalWorktrees) {
		if (!wt.branch) continue;
		result.set(wt.branch, {
			type: "external",
			worktreePath: wt.path,
			branch: wt.branch,
		});
	}

	// Tracked worktrees: only include those that exist on disk and have no active workspace
	for (const wt of trackedWorktrees) {
		if (!wt.branch) continue;
		if (!wt.existsOnDisk) continue;
		if (wt.hasActiveWorkspace) continue;
		result.set(wt.branch, { type: "tracked", worktreeId: wt.id });
	}

	return result;
}
