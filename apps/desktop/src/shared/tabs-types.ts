/**
 * Shared types for tabs/panes used by both main and renderer processes.
 * Renderer extends these with MosaicNode layout specifics.
 */

import type { ChangeCategory } from "./changes-types";

/**
 * Pane types that can be displayed within a tab
 */
export type PaneType = "terminal" | "webview" | "file-viewer" | "plan-viewer";

/**
 * File viewer display modes
 */
export type FileViewerMode = "rendered" | "raw" | "diff";

/**
 * Diff layout options for file viewer
 */
export type DiffLayout = "inline" | "side-by-side";

/**
 * Plan viewer pane-specific properties
 */
export interface PlanViewerState {
	/** The full markdown content of the plan */
	content: string;
	/** Unique identifier for this plan */
	planId: string;
	/** Terminal pane that submitted the plan (for future response channel) */
	originPaneId: string;
	/** Plan review status (future: 'approved' | 'rejected') */
	status: "pending";
	/** Brief one-line summary of the plan */
	summary?: string;
	/** When the plan was submitted */
	submittedAt: number;
	/** Which agent submitted the plan */
	agentType?: "opencode" | "claude";
	/** If true, this pane won't be reused for new plans */
	isLocked?: boolean;
}

/**
 * File viewer pane-specific properties
 */
export interface FileViewerState {
	/** Worktree-relative file path */
	filePath: string;
	/** Display mode: rendered (markdown), raw (source), or diff */
	viewMode: FileViewerMode;
	/** If true, this pane won't be reused for new file clicks */
	isLocked: boolean;
	/** Diff display layout */
	diffLayout: DiffLayout;
	/** Category for diff source (against-main, committed, staged, unstaged) */
	diffCategory?: ChangeCategory;
	/** Commit hash for committed category diffs */
	commitHash?: string;
	/** Original path for renamed files */
	oldPath?: string;
	/** Initial line to scroll to (raw mode only, transient - applied once) */
	initialLine?: number;
	/** Initial column to scroll to (raw mode only, transient - applied once) */
	initialColumn?: number;
}

/**
 * Base Pane interface - shared between main and renderer
 */
export interface Pane {
	id: string;
	tabId: string;
	type: PaneType;
	name: string;
	isNew?: boolean;
	needsAttention?: boolean;
	initialCommands?: string[];
	initialCwd?: string;
	url?: string; // For webview panes
	cwd?: string | null; // Current working directory
	cwdConfirmed?: boolean; // True if cwd confirmed via OSC-7, false if seeded
	fileViewer?: FileViewerState; // For file-viewer panes
	planViewer?: PlanViewerState; // For plan-viewer panes
}

/**
 * Base Tab interface - shared fields without layout
 */
export interface BaseTab {
	id: string;
	name: string;
	userTitle?: string;
	workspaceId: string;
	createdAt: number;
}

/**
 * Base tabs state - shared between main and renderer
 */
export interface BaseTabsState {
	tabs: BaseTab[];
	panes: Record<string, Pane>;
	activeTabIds: Record<string, string | null>; // workspaceId → tabId
	focusedPaneIds: Record<string, string>; // tabId → paneId
	tabHistoryStacks: Record<string, string[]>; // workspaceId → tabId[] (MRU history)
}
