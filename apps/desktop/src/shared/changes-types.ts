/**
 * Types for the git changes/diff viewer feature
 */

/** Change categories for organizing the sidebar */
export type ChangeCategory =
	| "against-base"
	| "committed"
	| "staged"
	| "unstaged";

/** Diff view mode toggle */
export type DiffViewMode = "side-by-side" | "inline";

/** File contents for diff viewer */
export interface FileContents {
	original: string; // Original content (before changes)
	modified: string; // Modified content (after changes)
	language: string; // Detected language for syntax highlighting
}
