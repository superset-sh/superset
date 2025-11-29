/**
 * Type definitions for diff UI state
 */

export type DiffMode = "unstaged" | "all-changes" | "range";

export interface CommitRange {
	from: string;
	to: string;
}

export interface DiffState {
	/** Current diff mode */
	mode: DiffMode;

	/** Commit range for "range" mode */
	commitRange: CommitRange | null;

	/** File path to scroll to (triggers scroll, then clears) */
	scrollToFilePath: string | null;

	/** Set of expanded folder paths in the file tree */
	expandedFolders: Set<string>;
}

export interface DiffActions {
	/** Set the diff mode */
	setMode: (mode: DiffMode) => void;

	/** Set the commit range for range mode */
	setCommitRange: (range: CommitRange | null) => void;

	/** Trigger scroll to a file in the diff viewer */
	scrollToFile: (path: string) => void;

	/** Clear the scroll target after scrolling completes */
	clearScrollTarget: () => void;

	/** Toggle a folder's expanded state */
	toggleFolder: (path: string) => void;

	/** Expand all folders */
	expandAllFolders: (paths: string[]) => void;

	/** Collapse all folders */
	collapseAllFolders: () => void;

	/** Reset all state (useful when switching workspaces) */
	reset: () => void;
}

export type DiffStore = DiffState & DiffActions;
