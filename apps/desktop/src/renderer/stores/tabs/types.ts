import type { MosaicBranch, MosaicNode } from "react-mosaic-component";

/**
 * Pane types that can be displayed within a tab
 */
export type PaneType = "terminal";

/**
 * A Pane represents a single terminal or content area within a Tab.
 * Panes always belong to a Tab and are referenced by ID in the Tab's layout.
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
}

/**
 * A Tab is a container that holds one or more Panes in a Mosaic layout.
 * Tabs are displayed in the sidebar and always have at least one Pane.
 */
export interface Tab {
	id: string;
	name: string;
	userTitle?: string;
	workspaceId: string;
	layout: MosaicNode<string>; // Always defined, leaves are paneIds
	createdAt: number;
}

/**
 * State for the tabs/panes store
 */
export interface TabsState {
	tabs: Tab[];
	panes: Record<string, Pane>;
	activeTabIds: Record<string, string | null>; // workspaceId → tabId
	focusedPaneIds: Record<string, string>; // tabId → paneId (last focused pane in each tab)
	tabHistoryStacks: Record<string, string[]>; // workspaceId → tabId[] (MRU history)
}

/**
 * Options for creating a tab with preset configuration
 */
export interface AddTabOptions {
	initialCommands?: string[];
	initialCwd?: string;
}

/**
 * Actions available on the tabs store
 */
export interface TabsStore extends TabsState {
	// Tab operations
	addTab: (
		workspaceId: string,
		options?: AddTabOptions,
	) => { tabId: string; paneId: string };
	removeTab: (tabId: string) => void;
	renameTab: (tabId: string, newName: string) => void;
	setTabAutoTitle: (tabId: string, title: string) => void;
	setActiveTab: (workspaceId: string, tabId: string) => void;
	reorderTabs: (
		workspaceId: string,
		startIndex: number,
		endIndex: number,
	) => void;
	reorderTabById: (tabId: string, targetIndex: number) => void;
	updateTabLayout: (tabId: string, layout: MosaicNode<string>) => void;

	// Pane operations
	addPane: (tabId: string) => string;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
	markPaneAsUsed: (paneId: string) => void;
	setNeedsAttention: (paneId: string, needsAttention: boolean) => void;
	clearPaneInitialData: (paneId: string) => void;

	// Split operations
	splitPaneVertical: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
	) => void;
	splitPaneHorizontal: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
	) => void;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;

	// Move operations
	movePaneToTab: (paneId: string, targetTabId: string) => void;
	movePaneToNewTab: (paneId: string) => string;

	// Query helpers
	getTabsByWorkspace: (workspaceId: string) => Tab[];
	getActiveTab: (workspaceId: string) => Tab | null;
	getPanesForTab: (tabId: string) => Pane[];
	getFocusedPane: (tabId: string) => Pane | null;
}
