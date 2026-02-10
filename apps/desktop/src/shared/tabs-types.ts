/**
 * Shared types for tabs/panes used by both main and renderer processes.
 * Renderer extends these with MosaicNode layout specifics.
 */

import type { ChangeCategory } from "./changes-types";

/**
 * Pane types that can be displayed within a tab
 */
export type PaneType = "terminal" | "webview" | "file-viewer" | "chat";

/**
 * Pane status for agent lifecycle indicators
 * - idle: No indicator shown (default)
 * - working: Agent actively processing (amber)
 * - permission: Agent blocked, needs user action (red)
 * - review: Agent completed, ready for review (green)
 */
export type PaneStatus = "idle" | "working" | "permission" | "review";

/** Non-idle status for UI indicators */
export type ActivePaneStatus = Exclude<PaneStatus, "idle">;

/**
 * Status priority order (higher = more urgent).
 * Single source of truth for aggregation logic.
 */
export const STATUS_PRIORITY = {
	idle: 0,
	review: 1,
	working: 2,
	permission: 3,
} as const satisfies Record<PaneStatus, number>;

/**
 * Compare two statuses and return the higher priority one.
 * Useful for reducing/folding over pane statuses.
 */
export function pickHigherStatus(
	a: PaneStatus | undefined,
	b: PaneStatus | undefined,
): PaneStatus {
	const aPriority = a ? STATUS_PRIORITY[a] : 0;
	const bPriority = b ? STATUS_PRIORITY[b] : 0;
	if (aPriority >= bPriority) return a ?? "idle";
	return b ?? "idle";
}

/**
 * Get the highest priority status from an iterable of statuses.
 * Returns null if all statuses are idle/undefined (no indicator needed).
 */
export function getHighestPriorityStatus(
	statuses: Iterable<PaneStatus | undefined>,
): ActivePaneStatus | null {
	let highest: PaneStatus = "idle";

	for (const status of statuses) {
		if (!status) continue;
		if (STATUS_PRIORITY[status] > STATUS_PRIORITY[highest]) {
			highest = status;
			// Early exit for max priority
			if (highest === "permission") break;
		}
	}

	return highest === "idle" ? null : highest;
}

/**
 * Resolve what a pane's status should become when the user acknowledges it
 * (e.g. clicking a tab, focusing a pane, selecting a workspace).
 *
 * - "review"     → "idle"    (user saw the completion)
 * - "permission" → "working" (user saw the prompt; assume granted)
 * - "working"    → unchanged (persists until agent stops)
 * - "idle"       → unchanged
 */
export function acknowledgedStatus(status: PaneStatus | undefined): PaneStatus {
	if (status === "review") return "idle";
	if (status === "permission") return "working";
	return status ?? "idle";
}

/**
 * File viewer display modes
 */
export type FileViewerMode = "rendered" | "raw" | "diff";

/**
 * Diff layout options for file viewer
 */
export type DiffLayout = "inline" | "side-by-side";

/**
 * File viewer pane-specific properties
 */
export interface FileViewerState {
	/** Worktree-relative file path */
	filePath: string;
	/** Display mode: rendered (markdown), raw (source), or diff */
	viewMode: FileViewerMode;
	/** If true, this pane won't be reused for new file clicks (preview mode = false, pinned = true) */
	isPinned: boolean;
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
	status?: PaneStatus;
	initialCommands?: string[];
	initialCwd?: string;
	url?: string; // For webview panes
	cwd?: string | null; // Current working directory
	cwdConfirmed?: boolean; // True if cwd confirmed via OSC-7, false if seeded
	fileViewer?: FileViewerState; // For file-viewer panes
	chat?: ChatPaneState; // For chat panes
}

/**
 * Chat pane-specific properties
 */
export interface ChatPaneState {
	/** Session ID for the chat session */
	sessionId: string;
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
