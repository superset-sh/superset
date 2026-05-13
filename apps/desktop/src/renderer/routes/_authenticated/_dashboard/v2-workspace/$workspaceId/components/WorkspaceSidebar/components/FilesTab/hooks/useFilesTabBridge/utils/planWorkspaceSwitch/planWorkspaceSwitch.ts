export interface WorkspaceSwitchPlan {
	/**
	 * Clear the bridge bookkeeping refs and reset the Pierre model to []. Set
	 * whenever `workspaceId` is non-empty so the previous workspace's tree can't
	 * linger on screen while the new workspace's `workspaceQuery` is still in
	 * flight (rootPath transiently "" between switch and resolve).
	 */
	resetState: boolean;
	/**
	 * Fire the initial root listDirectory. Only set once `rootPath` is known —
	 * before that we don't yet have an absolute path to query against.
	 */
	fetchRoot: boolean;
}

/**
 * Decide what the workspace-switch effect should do for the current
 * `(workspaceId, rootPath)` pair.
 *
 * Why this exists: an earlier version guarded the entire effect on
 * `rootPath && workspaceId`, so a workspace switch left the previous
 * workspace's files visible until the new `worktreePath` query resolved (or the
 * user clicked Refresh). Splitting state reset from the fetch lets us clear the
 * stale tree immediately on switch and defer the listing until rootPath lands.
 */
export function planWorkspaceSwitch(args: {
	workspaceId: string;
	rootPath: string;
}): WorkspaceSwitchPlan {
	if (!args.workspaceId) {
		return { resetState: false, fetchRoot: false };
	}
	return {
		resetState: true,
		fetchRoot: Boolean(args.rootPath),
	};
}
