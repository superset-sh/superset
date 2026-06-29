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
 *
 * Each flag is also time-bounded: it only suppresses a scroll that happens
 * within `SKIP_WINDOW_MS` of being set, and stale entries are purged whenever a
 * new one is added. This guarantees cleanup even if the target never activates
 * (e.g. the row was already active, so its effect never re-ran), so a lingering
 * flag can neither suppress an unrelated scroll later nor grow the map.
 */
const SKIP_WINDOW_MS = 1000;
const skipUntil = new Map<string, number>();

/** Mark that the next activation of `workspaceId` should NOT auto-scroll the sidebar. */
export function skipNextActiveScroll(workspaceId: string): void {
	const now = Date.now();
	// Drop expired flags so a never-consumed entry can't accumulate.
	for (const [id, expiry] of skipUntil) {
		if (expiry <= now) skipUntil.delete(id);
	}
	skipUntil.set(workspaceId, now + SKIP_WINDOW_MS);
}

/** Consume the one-shot flag for `workspaceId`; returns true if its scroll should be skipped. */
export function consumeSkipActiveScroll(workspaceId: string): boolean {
	const expiry = skipUntil.get(workspaceId);
	if (expiry === undefined) return false;
	skipUntil.delete(workspaceId);
	return expiry > Date.now();
}
