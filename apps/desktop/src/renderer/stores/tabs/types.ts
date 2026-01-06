import type { MosaicBranch, MosaicNode } from "react-mosaic-component";
import type { ChangeCategory } from "shared/changes-types";
import type {
	BaseTab,
	BaseTabsState,
	Pane,
	PaneStatus,
	PaneType,
} from "shared/tabs-types";

// Re-export shared types
export type { Pane, PaneStatus, PaneType };

/**
 * A Tab is a container that holds one or more Panes in a Mosaic layout.
 * Extends BaseTab with renderer-specific layout field.
 */
export interface Tab extends BaseTab {
	layout: MosaicNode<string>; // Always defined, leaves are paneIds
}

/**
 * State for the tabs/panes store.
 * Extends BaseTabsState with renderer-specific Tab type.
 */
export interface TabsState extends Omit<BaseTabsState, "tabs"> {
	tabs: Tab[];
}

/**
 * Options for creating a tab with preset configuration
 */
export interface AddTabOptions {
	initialCommands?: string[];
	initialCwd?: string;
}

/**
 * Options for opening a file in a file-viewer pane
 */
export interface AddFileViewerPaneOptions {
	filePath: string;
	diffCategory?: ChangeCategory;
	commitHash?: string;
	oldPath?: string;
	/** Line to scroll to (raw mode only) */
	line?: number;
	/** Column to scroll to (raw mode only) */
	column?: number;
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
	addPane: (tabId: string, options?: AddTabOptions) => string;
	addFileViewerPane: (
		workspaceId: string,
		options: AddFileViewerPaneOptions,
	) => string;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
	markPaneAsUsed: (paneId: string) => void;
	setPaneStatus: (paneId: string, status: PaneStatus) => void;
	clearWorkspaceAttentionStatus: (workspaceId: string) => void;
	updatePaneCwd: (
		paneId: string,
		cwd: string | null,
		confirmed: boolean,
	) => void;
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
