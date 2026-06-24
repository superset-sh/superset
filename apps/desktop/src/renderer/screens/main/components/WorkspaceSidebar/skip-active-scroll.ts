/**
 * One-shot signal: suppress the sidebar's "scroll the active workspace into
 * view" behavior for the next activation.
 *
 * Used when a workspace is activated from somewhere other than its own row —
 * e.g. clicking a linked-worktree entry that points at a worktree elsewhere in
 * the sidebar. In that case the user's focus should stay where they are, not
 * jump to the target's canonical row.
 */
let skip = false;

/** Mark that the next workspace activation should NOT auto-scroll the sidebar. */
export function skipNextActiveScroll(): void {
	skip = true;
}

/** Consume the one-shot flag; returns true if the next scroll should be skipped. */
export function consumeSkipActiveScroll(): boolean {
	if (skip) {
		skip = false;
		return true;
	}
	return false;
}
