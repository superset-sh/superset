/**
 * A worktree is "claimed" by a workspace when any workspace row references it —
 * including a workspace whose deletion is currently in progress (`deletingAt`
 * set). Claimed worktrees must NOT be surfaced as closed/openable worktrees in
 * the sidebar or the new-workspace modal.
 *
 * Previously, the logic that classified worktrees ignored workspaces that were
 * mid-deletion (it filtered them out with `isNull(deletingAt)`). As a result, a
 * worktree whose workspace had just been deleted would briefly reappear as a
 * "closed" worktree while teardown was still running, then vanish once the
 * worktree record was finally removed — the "worktrees still show up when I
 * delete them, sometimes worktrees randomly disappear" behavior in #5370.
 */

export interface WorktreeWorkspaceRow {
	/** Non-null when this workspace's deletion is in progress. */
	deletingAt: number | null;
}

/**
 * Returns whether a worktree is claimed by any workspace (active or being
 * deleted). Use this to decide whether a worktree should be hidden from the
 * closed/openable worktree lists.
 */
export function worktreeHasClaimingWorkspace(
	workspacesForWorktree: ReadonlyArray<WorktreeWorkspaceRow>,
): boolean {
	return workspacesForWorktree.length > 0;
}

/**
 * Returns the single non-deleting ("active") workspace for a worktree, if one
 * exists. A worktree mid-deletion has only a deleting workspace and therefore
 * no active workspace.
 */
export function findActiveWorkspace<T extends WorktreeWorkspaceRow>(
	workspacesForWorktree: ReadonlyArray<T>,
): T | null {
	return workspacesForWorktree.find((ws) => ws.deletingAt == null) ?? null;
}
