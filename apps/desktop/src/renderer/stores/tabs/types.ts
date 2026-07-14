import type { MosaicBranch, MosaicNode } from "react-mosaic-component";
import type { ChangeCategory, FileStatus } from "shared/changes-types";
import type {
	BaseTab,
	BaseTabsState,
	BrowserLoadError,
	ChatLaunchConfig,
	CommentPaneState,
	FileViewerMode,
	Pane,
	PaneStatus,
	PaneType,
	ViewportPreset,
} from "shared/tabs-types";

// Re-export shared types
export type { Pane, PaneStatus, PaneType };

/**
 * Data required to open a comment pane
 */
export type CommentPaneData = CommentPaneState;

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
	/**
	 * Panel (VS Code-style editor group) this tab lives in. Optional: tabs with
	 * a missing/unknown panelId resolve to the workspace's first panel.
	 */
	panelId?: string;
}

/**
 * State for the tabs/panes store.
 * Extends BaseTabsState with renderer-specific Tab type.
 */
export interface TabsState extends Omit<BaseTabsState, "tabs"> {
	tabs: Tab[];
	closedTabsStack: ClosedTabEntry[];
	/**
	 * Panel split tree per workspace. Leaves are panelIds. Null/missing means a
	 * single implicit panel holding all of the workspace's tabs.
	 */
	panelLayouts: Record<string, MosaicNode<string> | null>;
	/** Active (visible) tab per panel. Stale entries are ignored on read. */
	panelActiveTabIds: Record<string, string>;
}

/**
 * Options for creating a tab with preset configuration
 */
export interface AddTabOptions {
	initialCwd?: string;
	/** Panel to place the new tab in (defaults to the focused panel) */
	panelId?: string;
}

export interface SplitPaneOptions {
	initialCwd?: string;
	paneType?: "terminal" | "chat" | "webview";
}

export interface AddChatTabOptions {
	launchConfig?: ChatLaunchConfig | null;
	/** Panel to place the new tab in (defaults to the focused panel) */
	panelId?: string;
}

export interface AddTabWithMultiplePanesOptions {
	commands: string[];
	initialCwd?: string;
}

export type MosaicDropPosition = "top" | "bottom" | "left" | "right";
export type FileViewerReuseScope = "none" | "active-tab" | "workspace";

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
	/** Controls whether file-viewer opens may reuse existing panes instead of always opening a fresh pane/tab */
	reuseExisting?: FileViewerReuseScope;
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
	addChatTab: (
		workspaceId: string,
		options?: AddChatTabOptions,
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
	addChatPane: (tabId: string, options?: AddChatTabOptions) => string;
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
	setPaneWorkspaceRun: (
		paneId: string,
		workspaceRun: {
			workspaceId: string;
			state: "running" | "stopped-by-user" | "stopped-by-exit";
			command?: string;
		} | null,
	) => void;
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

	// Equalize operations
	equalizePaneSplits: (tabId: string) => void;

	// Move operations
	movePaneToTab: (paneId: string, targetTabId: string) => void;
	movePaneToNewTab: (paneId: string) => string;
	mergeTabIntoTab: (
		sourceTabId: string,
		targetTabId: string,
		destinationPath: MosaicBranch[],
		position: MosaicDropPosition,
	) => void;

	// Panel (editor group) operations
	/** Persist the panel split tree for a workspace (resize/rearrange) */
	updatePanelLayout: (workspaceId: string, layout: MosaicNode<string>) => void;
	/**
	 * Move a tab into an existing panel. `targetIndex` positions the tab within
	 * the panel's strip; omitted = append. Same-panel moves are reorders.
	 */
	moveTabToPanel: (
		tabId: string,
		targetPanelId: string,
		targetIndex?: number,
	) => void;
	/**
	 * Create a new panel next to `destinationPanelId` (VS Code-style edge drop)
	 * and move the tab into it.
	 */
	splitPanelWithTab: (
		tabId: string,
		destinationPanelId: string,
		position: MosaicDropPosition,
	) => void;

	// Comment operations
	/**
	 * Open a PR/review comment in a pane. Reuses an existing comment pane in
	 * the workspace if one is found; otherwise creates a new tab with a
	 * comment pane.
	 */
	openCommentPane: (
		workspaceId: string,
		comment: CommentPaneData,
	) => { tabId: string; paneId: string };

	// Browser operations
	addBrowserTab: (
		workspaceId: string,
		url?: string,
		options?: { panelId?: string },
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
	/** Switch a chat pane to a different session */
	switchChatSession: (paneId: string, sessionId: string | null) => void;
	setChatLaunchConfig: (
		paneId: string,
		launchConfig: AddChatTabOptions["launchConfig"],
	) => void;

	// Query helpers
	getTabsByWorkspace: (workspaceId: string) => Tab[];
	getActiveTab: (workspaceId: string) => Tab | null;
	getPanesForTab: (tabId: string) => Pane[];
	getFocusedPane: (tabId: string) => Pane | null;
}
