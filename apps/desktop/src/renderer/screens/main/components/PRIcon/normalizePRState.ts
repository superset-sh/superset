import type { PRState } from "./PRIcon";

/**
 * Map a raw GitHub PR state string + draft flag to the canonical PRState
 * used by PRIcon and the rest of the renderer. Draft trumps merged/closed/open.
 */
export function normalizePRState(state: string, isDraft: boolean): PRState {
	if (isDraft) return "draft";
	const lower = state.toLowerCase();
	if (lower === "merged") return "merged";
	if (lower === "closed") return "closed";
	return "open";
}
