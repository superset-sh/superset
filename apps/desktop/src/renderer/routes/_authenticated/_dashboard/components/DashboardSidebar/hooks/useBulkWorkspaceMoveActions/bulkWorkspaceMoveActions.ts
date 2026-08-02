export type BulkWorkspaceSectionMenuState = "populated" | "loading" | "empty";

/**
 * Preserves cached section rows while the live query settles and only exposes
 * loading or empty states when no rows are available.
 */
export function resolveBulkWorkspaceSectionMenuState(
	sections: readonly unknown[] | undefined,
	isReady: boolean,
): BulkWorkspaceSectionMenuState {
	if (sections && sections.length > 0) return "populated";
	return isReady ? "empty" : "loading";
}
