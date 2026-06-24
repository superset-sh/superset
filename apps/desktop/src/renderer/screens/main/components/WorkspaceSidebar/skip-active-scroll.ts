/**
 * One-shot signal: suppress the sidebar's "scroll the active workspace into
 * view" behavior for the next activation of a specific workspace.
 *
 * Used when a workspace is activated from somewhere other than its own row —
 * e.g. clicking a linked-worktree entry that points at a worktree elsewhere in
 * the sidebar. In that case the user's focus should stay where they are, not
 * jump to the target's canonical row.
 *
 * Keyed by workspace id so only the intended row consumes the flag: an
 * unrelated item re-rendering (or StrictMode double-invoking effects) can't
 * accidentally swallow the signal meant for the target.
 */
const skipIds = new Set<string>();

/** Mark that the next activation of `workspaceId` should NOT auto-scroll the sidebar. */
export function skipNextActiveScroll(workspaceId: string): void {
	skipIds.add(workspaceId);
}

/** Consume the one-shot flag for `workspaceId`; returns true if its scroll should be skipped. */
export function consumeSkipActiveScroll(workspaceId: string): boolean {
	return skipIds.delete(workspaceId);
}
