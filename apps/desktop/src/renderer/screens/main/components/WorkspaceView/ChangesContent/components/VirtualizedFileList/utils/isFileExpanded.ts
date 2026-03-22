/**
 * Determines whether a file diff section should be expanded.
 *
 * A file is collapsed if it appears in either `collapsedFiles` (explicit user toggle)
 * or `viewedFiles` (marked as viewed). This ensures that viewed files remain collapsed
 * even when `collapsedFiles` resets (e.g., after a workspace switch remounts
 * InfiniteScrollView).
 */
export function isFileExpanded(
	fileKey: string,
	collapsedFiles: Set<string>,
	viewedFiles: Set<string>,
): boolean {
	return !collapsedFiles.has(fileKey) && !viewedFiles.has(fileKey);
}
