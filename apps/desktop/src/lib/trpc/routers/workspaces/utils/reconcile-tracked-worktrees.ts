import type { ExternalWorktree } from "./git";

export interface TrackedWorktree {
	id: string;
	path: string;
	branch: string;
}

interface ReconcileArgs {
	trackedWorktrees: TrackedWorktree[];
	liveWorktrees: ExternalWorktree[];
	hasActiveWorkspace: (worktreeId: string) => boolean;
}

interface ReconcileResult {
	/** DB rows whose underlying worktree no longer matches reality. */
	staleIds: string[];
	/** Paths that should still be treated as tracked (and skipped on import). */
	validPaths: Set<string>;
}

/**
 * Detect tracked `worktrees` rows whose underlying state no longer matches the
 * live `git worktree list` output — either the path is gone, or a worktree at
 * the same path is now on a different branch. A row is only considered stale
 * when no active workspace depends on it, so we never destructively drop a
 * record the user is still using.
 *
 * Without this reconciliation, `getExternalWorktrees` silently excludes
 * recreated worktrees because the stale row's `path` still matches.
 */
export function reconcileTrackedWorktrees({
	trackedWorktrees,
	liveWorktrees,
	hasActiveWorkspace,
}: ReconcileArgs): ReconcileResult {
	const liveByPath = new Map(liveWorktrees.map((wt) => [wt.path, wt]));
	const staleIds: string[] = [];
	const validPaths = new Set<string>();

	for (const tracked of trackedWorktrees) {
		const live = liveByPath.get(tracked.path);
		const isStale = !live || live.branch !== tracked.branch;
		if (isStale && !hasActiveWorkspace(tracked.id)) {
			staleIds.push(tracked.id);
			continue;
		}
		validPaths.add(tracked.path);
	}

	return { staleIds, validPaths };
}
