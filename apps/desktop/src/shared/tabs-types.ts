/**
 * Shared types for tabs/panes used by both main and renderer processes.
 * Renderer extends these with MosaicNode layout specifics.
 */

/**
 * Pane types that can be displayed within a tab
 */
export type PaneType = "terminal" | "webview";

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
