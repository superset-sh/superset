import type { MosaicBranch, MosaicNode } from "react-mosaic-component";
import type { ChangeCategory, FileStatus } from "shared/changes-types";
import type {
	BaseTab,
	BaseTabsState,
	BrowserLoadError,
	ChatMastraLaunchConfig,
	FileViewerMode,
	Pane,
	PaneStatus,
	PaneType,
	ViewportPreset,
} from "shared/tabs-types";

// Re-export shared types
export type { Pane, PaneStatus, PaneType };

/**
 * Snapshot of a closed tab + its panes, used for "reopen closed tab".
 */
export interface ClosedTabEntry {
	tab: Tab;
	panes: Pane[];
	closedAt: number;
}

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
	closedTabsStack: ClosedTabEntry[];
}

/**
 * Options for creating a tab with preset configuration
 */
export interface AddTabOptions {
	initialCwd?: string;
}

export interface SplitPaneOptions {
	initialCwd?: string;
	paneType?: "terminal" | "chat-mastra" | "webview";
}

export interface AddChatMastraTabOptions {
	launchConfig?: ChatMastraLaunchConfig | null;
}

export interface AddTabWithMultiplePanesOptions {
	commands: string[];
	initialCwd?: string;
}

/**
 * Options for opening a file in a file-viewer pane
 */
export interface AddFileViewerPaneOptions {
	/** Canonical absolute filesystem path, or remote URL for non-local content */
	filePath: string;
	displayName?: string;
	/** Override default view mode (raw/diff/rendered) */
	viewMode?: FileViewerMode;
	diffCategory?: ChangeCategory;
	/** File status from git — used to determine default view mode for new files */
	fileStatus?: FileStatus;
	commitHash?: string;
	/** Canonical absolute original path for renamed files */
	oldPath?: string;
	/** Line to scroll to (raw mode only) */
	line?: number;
	/** Column to scroll to (raw mode only) */
	column?: number;
	/** If true, opens pinned (permanent). If false/undefined, opens in preview mode (can be replaced) */
	isPinned?: boolean;
	/** If true, opens in a new tab instead of splitting the current tab */
	openInNewTab?: boolean;
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
	addChatMastraTab: (
		workspaceId: string,
		options?: AddChatMastraTabOptions,
	) => { tabId: string; paneId: string };
	addTabWithMultiplePanes: (
		workspaceId: string,
		options: AddTabWithMultiplePanesOptions,
	) => { tabId: string; paneIds: string[] };
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
	addChatMastraPane: (
		tabId: string,
		options?: AddChatMastraTabOptions,
	) => string;
	addPanesToTab: (
		tabId: string,
		options: AddTabWithMultiplePanesOptions,
	) => string[];
	addFileViewerPane: (
		workspaceId: string,
		options: AddFileViewerPaneOptions,
	) => string;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
	markPaneAsUsed: (paneId: string) => void;
	setPaneStatus: (paneId: string, status: PaneStatus) => void;
	setPaneName: (paneId: string, name: string) => void;
	setPaneAutoTitle: (paneId: string, title: string) => void;
	clearWorkspaceAttentionStatus: (workspaceId: string) => void;
	resetWorkspaceStatus: (workspaceId: string) => void;
	updatePaneCwd: (
		paneId: string,
		cwd: string | null,
		confirmed: boolean,
	) => void;
	retargetFileViewerPaths: (
		workspaceId: string,
		oldAbsolutePath: string,
		newAbsolutePath: string,
		isDirectory: boolean,
	) => void;
	clearPaneInitialData: (paneId: string) => void;
	/** Pin a file-viewer pane so it won't be replaced by new file clicks */
	pinPane: (paneId: string) => void;

	// Split operations
	splitPaneVertical: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
		options?: SplitPaneOptions,
	) => void;
	splitPaneHorizontal: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
		options?: SplitPaneOptions,
	) => void;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
		options?: SplitPaneOptions,
	) => void;

	// Move operations
	movePaneToTab: (paneId: string, targetTabId: string) => void;
	movePaneToNewTab: (paneId: string) => string;

	// Browser operations
	addBrowserTab: (
		workspaceId: string,
		url?: string,
	) => { tabId: string; paneId: string };
	openInBrowserPane: (workspaceId: string, url: string) => void;
	updateBrowserUrl: (
		paneId: string,
		url: string,
		title: string,
		faviconUrl?: string,
	) => void;
	navigateBrowserHistory: (
		paneId: string,
		direction: "back" | "forward",
	) => string | null;
	updateBrowserLoading: (paneId: string, isLoading: boolean) => void;
	setBrowserError: (paneId: string, error: BrowserLoadError | null) => void;
	setBrowserViewport: (paneId: string, viewport: ViewportPreset | null) => void;
	openDevToolsPane: (
		tabId: string,
		browserPaneId: string,
		path?: MosaicBranch[],
	) => string | null;

	// Reopen operations
	/** Reopen the last closed tab for a workspace. Returns true if a tab was reopened. */
	reopenClosedTab: (workspaceId: string) => boolean;

	// Chat operations
	/** Switch a Mastra chat pane to a different session */
	switchChatMastraSession: (paneId: string, sessionId: string | null) => void;
	setChatMastraLaunchConfig: (
		paneId: string,
		launchConfig: AddChatMastraTabOptions["launchConfig"],
	) => void;

	// Query helpers
	getTabsByWorkspace: (workspaceId: string) => Tab[];
	getActiveTab: (workspaceId: string) => Tab | null;
	getPanesForTab: (tabId: string) => Pane[];
	getFocusedPane: (tabId: string) => Pane | null;
}
