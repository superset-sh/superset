import type { MosaicBranch, MosaicNode } from "react-mosaic-component";
import type { ChangeCategory } from "shared/changes-types";
import { hasRenderedPreview, isImageFile } from "shared/file-types";
import type {
	BrowserPaneState,
	DevToolsPaneState,
	DiffLayout,
	FileViewerMode,
	FileViewerState,
} from "shared/tabs-types";
import type { Pane, PaneType, Tab } from "./types";

export const resolveFileViewerMode = ({
	filePath,
	diffCategory,
	viewMode,
}: {
	filePath: string;
	diffCategory?: ChangeCategory;
	viewMode?: FileViewerMode;
}): FileViewerMode => {
	if (viewMode) return viewMode;
	// Images always default to rendered (no meaningful diff for binary files)
	if (isImageFile(filePath)) return "rendered";
	if (diffCategory) return "diff";
	if (hasRenderedPreview(filePath)) return "rendered";
	return "raw";
};

/**
 * Generates a unique ID with the given prefix
 */
export const generateId = (prefix: string): string => {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

export const getTabDisplayName = (tab: Tab): string => {
	const userTitle = tab.userTitle?.trim();
	if (userTitle) {
		return userTitle;
	}
	const name = tab.name || "Terminal";
	// If name looks like a path, extract just the last directory name
	if (name.includes("/")) {
		const parts = name.split("/").filter(Boolean);
		return parts[parts.length - 1] || name;
	}
	return name;
};

export function resolveActiveTabIdForWorkspace({
	workspaceId,
	tabs,
	activeTabIds,
	tabHistoryStacks,
}: {
	workspaceId: string;
	tabs: Tab[];
	activeTabIds: Record<string, string | null | undefined>;
	tabHistoryStacks: Record<string, string[] | undefined>;
}): string | null {
	const workspaceTabIds = new Set<string>();
	let firstWorkspaceTabId: string | null = null;

	for (const tab of tabs) {
		if (tab.workspaceId !== workspaceId) continue;
		workspaceTabIds.add(tab.id);
		if (firstWorkspaceTabId === null) {
			firstWorkspaceTabId = tab.id;
		}
	}

	const isWorkspaceTabId = (
		tabId: string | null | undefined,
	): tabId is string => {
		return typeof tabId === "string" && workspaceTabIds.has(tabId);
	};

	const activeTabId = activeTabIds[workspaceId];
	if (isWorkspaceTabId(activeTabId)) {
		return activeTabId;
	}

	const historyStack = tabHistoryStacks[workspaceId] ?? [];
	for (const historyTabId of historyStack) {
		if (isWorkspaceTabId(historyTabId)) {
			return historyTabId;
		}
	}

	return firstWorkspaceTabId;
}

/**
 * Extracts all pane IDs from a mosaic layout tree in visual navigation order:
 * left-to-right, top-to-bottom.
 *
 * For react-mosaic layouts:
 * - direction: "row" = horizontal split (first is left, second is right)
 * - direction: "column" = vertical split (first is top, second is bottom)
 *
 * This traversal visits `first` before `second` at each node, which produces
 * left-to-right ordering for horizontal splits and top-to-bottom for vertical splits.
 *
 * Example layout:
 * ```
 * ┌───────┬───────┐
 * │   A   │   B   │  (row split: first=A, second=B)
 * ├───────┼───────┤
 * │   C   │   D   │  (row split: first=C, second=D)
 * └───────┴───────┘
 * ```
 * If the top row is `first` in a column split, order would be: [A, B, C, D]
 */
export const extractPaneIdsFromLayout = (
	layout: MosaicNode<string>,
): string[] => {
	if (typeof layout === "string") {
		return [layout];
	}

	return [
		...extractPaneIdsFromLayout(layout.first),
		...extractPaneIdsFromLayout(layout.second),
	];
};

/** Alias for extractPaneIdsFromLayout emphasizing the visual ordering contract */
export const getPaneIdsInVisualOrder = extractPaneIdsFromLayout;

/**
 * Options for creating a pane with preset configuration
 */
export interface CreatePaneOptions {
	initialCommands?: string[];
	initialCwd?: string;
}

/**
 * Creates a new pane with the given properties
 */
export const createPane = (
	tabId: string,
	type: PaneType = "terminal",
	options?: CreatePaneOptions,
): Pane => {
	const id = generateId("pane");

	return {
		id,
		tabId,
		type,
		name: "Terminal",
		isNew: true,
		initialCommands: options?.initialCommands,
		initialCwd: options?.initialCwd,
	};
};

/**
 * Options for creating a file-viewer pane
 */
export interface CreateFileViewerPaneOptions {
	filePath: string;
	viewMode?: FileViewerMode;
	/** If true, opens pinned (permanent). If false/undefined, opens in preview mode (can be replaced) */
	isPinned?: boolean;
	diffLayout?: DiffLayout;
	diffCategory?: ChangeCategory;
	commitHash?: string;
	oldPath?: string;
	/** Line to scroll to (raw mode only) */
	line?: number;
	/** Column to scroll to (raw mode only) */
	column?: number;
}

/**
 * Creates a new file-viewer pane with the given properties
 */
export const createFileViewerPane = (
	tabId: string,
	options: CreateFileViewerPaneOptions,
): Pane => {
	const id = generateId("pane");

	const resolvedViewMode = resolveFileViewerMode({
		filePath: options.filePath,
		diffCategory: options.diffCategory,
		viewMode: options.viewMode,
	});

	const fileViewer: FileViewerState = {
		filePath: options.filePath,
		viewMode: resolvedViewMode,
		isPinned: options.isPinned ?? false,
		diffLayout: options.diffLayout ?? "inline",
		diffCategory: options.diffCategory,
		commitHash: options.commitHash,
		oldPath: options.oldPath,
		initialLine: options.line,
		initialColumn: options.column,
	};

	// Use filename for display name
	const fileName = options.filePath.split("/").pop() || options.filePath;

	return {
		id,
		tabId,
		type: "file-viewer",
		name: fileName,
		fileViewer,
	};
};

/**
 * Creates a new chat pane
 */
export const createChatPane = (tabId: string): Pane => {
	const id = generateId("pane");

	return {
		id,
		tabId,
		type: "chat",
		name: "Chat",
		chat: {
			sessionId: generateId("chat-session"),
		},
	};
};

/**
 * Options for creating a browser pane
 */
export interface CreateBrowserPaneOptions {
	url?: string;
}

const DEFAULT_BROWSER_URL = "about:blank";

/**
 * Creates a new browser (webview) pane
 */
export const createBrowserPane = (
	tabId: string,
	options?: CreateBrowserPaneOptions,
): Pane => {
	const id = generateId("pane");
	const url = options?.url ?? DEFAULT_BROWSER_URL;

	const browser: BrowserPaneState = {
		currentUrl: url,
		history: [{ url, title: "", timestamp: Date.now() }],
		historyIndex: 0,
		isLoading: false,
	};

	return {
		id,
		tabId,
		type: "webview",
		name: "Browser",
		browser,
	};
};

/**
 * Creates a new DevTools pane targeting a browser pane
 */
export const createDevToolsPane = (
	tabId: string,
	targetPaneId: string,
): Pane => {
	const id = generateId("pane");
	const devtools: DevToolsPaneState = { targetPaneId };
	return {
		id,
		tabId,
		type: "devtools",
		name: "DevTools",
		devtools,
	};
};

/**
 * Creates a new tab with a browser pane atomically
 */
export const createBrowserTabWithPane = (
	workspaceId: string,
	existingTabs: Tab[] = [],
	url?: string,
): { tab: Tab; pane: Pane } => {
	const tabId = generateId("tab");
	const pane = createBrowserPane(tabId, url ? { url } : undefined);

	const workspaceTabs = existingTabs.filter(
		(t) => t.workspaceId === workspaceId,
	);

	const tab: Tab = {
		id: tabId,
		name: `Browser ${workspaceTabs.filter((t) => t.name.startsWith("Browser")).length + 1}`,
		workspaceId,
		layout: pane.id,
		createdAt: Date.now(),
	};

	return { tab, pane };
};

/**
 * Creates a new tab with a chat pane atomically
 */
export const createChatTabWithPane = (
	workspaceId: string,
	existingTabs: Tab[] = [],
): { tab: Tab; pane: Pane } => {
	const tabId = generateId("tab");
	const pane = createChatPane(tabId);

	const workspaceTabs = existingTabs.filter(
		(t) => t.workspaceId === workspaceId,
	);

	const tab: Tab = {
		id: tabId,
		name: `Chat ${workspaceTabs.filter((t) => t.name.startsWith("Chat")).length + 1}`,
		workspaceId,
		layout: pane.id,
		createdAt: Date.now(),
	};

	return { tab, pane };
};

/**
 * Generates a static tab name based on existing tabs
 * (e.g., "Terminal 1", "Terminal 2", finding the next available number)
 */
export const generateTabName = (existingTabs: Tab[]): string => {
	const existingNumbers = existingTabs
		.map((t) => {
			const match = t.name.match(/^Terminal (\d+)$/);
			return match ? Number.parseInt(match[1], 10) : 0;
		})
		.filter((n) => n > 0);

	let nextNumber = 1;
	while (existingNumbers.includes(nextNumber)) {
		nextNumber++;
	}

	return `Terminal ${nextNumber}`;
};

/**
 * Creates a new tab with an initial pane atomically
 * This ensures the invariant that tabs always have at least one pane
 */
export const createTabWithPane = (
	workspaceId: string,
	existingTabs: Tab[] = [],
	options?: CreatePaneOptions,
): { tab: Tab; pane: Pane } => {
	const tabId = generateId("tab");
	const pane = createPane(tabId, "terminal", options);

	// Filter to same workspace for tab naming
	const workspaceTabs = existingTabs.filter(
		(t) => t.workspaceId === workspaceId,
	);

	const tab: Tab = {
		id: tabId,
		name: generateTabName(workspaceTabs),
		workspaceId,
		layout: pane.id, // Single pane = leaf node
		createdAt: Date.now(),
	};

	return { tab, pane };
};

/**
 * Gets all pane IDs that belong to a specific tab
 */
export const getPaneIdsForTab = (
	panes: Record<string, Pane>,
	tabId: string,
): string[] => {
	return Object.values(panes)
		.filter((pane) => pane.tabId === tabId)
		.map((pane) => pane.id);
};

/**
 * Checks if a tab has only one pane remaining
 */
export const isLastPaneInTab = (
	panes: Record<string, Pane>,
	tabId: string,
): boolean => {
	return getPaneIdsForTab(panes, tabId).length === 1;
};

/**
 * Removes a pane ID from a mosaic layout tree
 * Returns null if the layout becomes empty after removal
 */
export const removePaneFromLayout = (
	layout: MosaicNode<string> | null,
	paneIdToRemove: string,
): MosaicNode<string> | null => {
	if (!layout) return null;

	// If layout is a leaf node (single pane ID)
	if (typeof layout === "string") {
		return layout === paneIdToRemove ? null : layout;
	}

	const newFirst = removePaneFromLayout(layout.first, paneIdToRemove);
	const newSecond = removePaneFromLayout(layout.second, paneIdToRemove);

	if (!newFirst && !newSecond) return null;
	if (!newFirst) return newSecond;
	if (!newSecond) return newFirst;

	return {
		...layout,
		first: newFirst,
		second: newSecond,
	};
};

/**
 * Validates layout against valid pane IDs and removes any invalid references
 */
export const cleanLayout = (
	layout: MosaicNode<string> | null,
	validPaneIds: Set<string>,
): MosaicNode<string> | null => {
	if (!layout) return null;

	if (typeof layout === "string") {
		return validPaneIds.has(layout) ? layout : null;
	}

	const newFirst = cleanLayout(layout.first, validPaneIds);
	const newSecond = cleanLayout(layout.second, validPaneIds);

	if (!newFirst && !newSecond) return null;
	if (!newFirst) return newSecond;
	if (!newSecond) return newFirst;

	// If children are identical references, return original layout to avoid churn
	if (newFirst === layout.first && newSecond === layout.second) {
		return layout;
	}

	return {
		...layout,
		first: newFirst,
		second: newSecond,
	};
};

/**
 * Gets the first pane ID from a layout (useful for focus fallback)
 */
export const getFirstPaneId = (layout: MosaicNode<string>): string => {
	if (typeof layout === "string") {
		return layout;
	}
	return getFirstPaneId(layout.first);
};

/**
 * Gets the next pane ID in visual order (left-to-right, top-to-bottom),
 * wrapping around to the first if at the end.
 */
export const getNextPaneId = (
	layout: MosaicNode<string>,
	currentPaneId: string,
): string | null => {
	const paneIds = getPaneIdsInVisualOrder(layout);
	if (paneIds.length <= 1) return null;

	const currentIndex = paneIds.indexOf(currentPaneId);
	if (currentIndex === -1) return paneIds[0];

	const nextIndex = (currentIndex + 1) % paneIds.length;
	return paneIds[nextIndex];
};

/**
 * Gets the previous pane ID in visual order (right-to-left, bottom-to-top),
 * wrapping around to the last if at the beginning.
 */
export const getPreviousPaneId = (
	layout: MosaicNode<string>,
	currentPaneId: string,
): string | null => {
	const paneIds = getPaneIdsInVisualOrder(layout);
	if (paneIds.length <= 1) return null;

	const currentIndex = paneIds.indexOf(currentPaneId);
	if (currentIndex === -1) return paneIds[paneIds.length - 1];

	const prevIndex = (currentIndex - 1 + paneIds.length) % paneIds.length;
	return paneIds[prevIndex];
};

/**
 * Gets the adjacent pane ID for focus fallback when a pane is closed.
 * Prefers the next pane in visual order, falls back to previous if at the end.
 * Returns null only if the pane is the only one in the layout.
 */
export const getAdjacentPaneId = (
	layout: MosaicNode<string>,
	closingPaneId: string,
): string | null => {
	const paneIds = getPaneIdsInVisualOrder(layout);
	if (paneIds.length <= 1) return null;

	const currentIndex = paneIds.indexOf(closingPaneId);
	if (currentIndex === -1) return paneIds[0];

	if (currentIndex < paneIds.length - 1) {
		return paneIds[currentIndex + 1];
	}
	return paneIds[currentIndex - 1];
};

/**
 * Finds the path to a specific pane ID in a mosaic layout
 * Returns the path as an array of MosaicBranch ("first" | "second"), or null if not found
 */
export const findPanePath = (
	layout: MosaicNode<string>,
	paneId: string,
	currentPath: MosaicBranch[] = [],
): MosaicBranch[] | null => {
	if (typeof layout === "string") {
		return layout === paneId ? currentPath : null;
	}

	const firstPath = findPanePath(layout.first, paneId, [
		...currentPath,
		"first",
	]);
	if (firstPath) return firstPath;

	const secondPath = findPanePath(layout.second, paneId, [
		...currentPath,
		"second",
	]);
	if (secondPath) return secondPath;

	return null;
};

/**
 * Adds a pane to an existing layout by creating a split
 */
export const addPaneToLayout = (
	existingLayout: MosaicNode<string>,
	newPaneId: string,
): MosaicNode<string> => ({
	direction: "row",
	first: existingLayout,
	second: newPaneId,
	splitPercentage: 50,
});

/**
 * Builds a balanced multi-pane Mosaic layout using recursive binary splits.
 * For 3+ panes, alternates between column and row splits to create a grid.
 */
export const buildMultiPaneLayout = (
	paneIds: string[],
	direction: "row" | "column" = "column",
): MosaicNode<string> => {
	if (paneIds.length === 0) {
		throw new Error("Cannot build layout with zero panes");
	}

	if (paneIds.length === 1) {
		return paneIds[0];
	}

	if (paneIds.length === 2) {
		return {
			direction: "row",
			first: paneIds[0],
			second: paneIds[1],
			splitPercentage: 50,
		};
	}

	const mid = Math.ceil(paneIds.length / 2);
	const nextDirection = direction === "column" ? "row" : "column";

	return {
		direction,
		first: buildMultiPaneLayout(paneIds.slice(0, mid), nextDirection),
		second: buildMultiPaneLayout(paneIds.slice(mid), nextDirection),
		splitPercentage: 50,
	};
};

/**
 * Updates the history stack when switching to a new active tab
 * Adds the current active to history and removes the new active from history
 */
export const updateHistoryStack = (
	historyStack: string[],
	currentActiveId: string | null,
	newActiveId: string,
	tabIdToRemove?: string,
): string[] => {
	let newStack = historyStack.filter((id) => id !== newActiveId);

	if (currentActiveId && currentActiveId !== newActiveId) {
		newStack = [
			currentActiveId,
			...newStack.filter((id) => id !== currentActiveId),
		];
	}

	if (tabIdToRemove) {
		newStack = newStack.filter((id) => id !== tabIdToRemove);
	}

	return newStack;
};
