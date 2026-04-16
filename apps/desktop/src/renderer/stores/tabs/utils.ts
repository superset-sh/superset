import type { MosaicBranch, MosaicNode } from "react-mosaic-component";
import {
	getPathBaseName,
	isRemotePath,
	pathsMatch,
} from "shared/absolute-paths";
import {
	type ChangeCategory,
	type FileStatus,
	isNewFile,
} from "shared/changes-types";
import { hasRenderedPreview, isImageFile } from "shared/file-types";
import {
	acknowledgedStatus,
	type BrowserPaneState,
	type DevToolsPaneState,
	type DiffLayout,
	type FileViewerMode,
	type FileViewerState,
} from "shared/tabs-types";
import type {
	AddChatTabOptions,
	AddFileViewerPaneOptions,
	FileViewerReuseScope,
	Pane,
	PaneType,
	Tab,
	TabsState,
} from "./types";

export const resolveFileViewerMode = ({
	filePath,
	diffCategory,
	viewMode,
	fileStatus,
}: {
	filePath: string;
	diffCategory?: ChangeCategory;
	viewMode?: FileViewerMode;
	fileStatus?: FileStatus;
}): FileViewerMode => {
	if (viewMode) return viewMode;
	// Images always default to rendered (no meaningful diff for binary files)
	if (isImageFile(filePath)) return "rendered";
	// New files have no previous version — show raw/rendered instead of an all-green diff
	if (diffCategory && fileStatus && isNewFile(fileStatus)) {
		if (hasRenderedPreview(filePath)) return "rendered";
		return "raw";
	}
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
		initialCwd: options?.initialCwd,
	};
};

/**
 * Options for creating a file-viewer pane
 */
export interface CreateFileViewerPaneOptions {
	filePath: string;
	displayName?: string;
	viewMode?: FileViewerMode;
	/** If true, opens pinned (permanent). If false/undefined, opens in preview mode (can be replaced) */
	isPinned?: boolean;
	diffLayout?: DiffLayout;
	diffCategory?: ChangeCategory;
	/** File status from git — used to determine default view mode for new files */
	fileStatus?: FileStatus;
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
		fileStatus: options.fileStatus,
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
		displayName: options.displayName,
	};

	// Use filename for display name
	const fileName = options.displayName || getPathBaseName(options.filePath);

	return {
		id,
		tabId,
		type: "file-viewer",
		name: fileName,
		fileViewer,
	};
};

export const createChatPane = (
	tabId: string,
	options?: AddChatTabOptions,
): Pane => {
	const id = generateId("pane");
	const sessionId = crypto.randomUUID();

	return {
		id,
		tabId,
		type: "chat",
		name: "New Chat",
		chat: {
			sessionId,
			launchConfig: options?.launchConfig ?? null,
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

export const createChatTabWithPane = (
	workspaceId: string,
	options?: AddChatTabOptions,
): { tab: Tab; pane: Pane } => {
	const tabId = generateId("tab");
	const pane = createChatPane(tabId, options);

	const tab: Tab = {
		id: tabId,
		name: "New Chat",
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

export const getPaneIdSetForTab = (
	panes: Record<string, Pane>,
	tabId: string,
): Set<string> => {
	return new Set(getPaneIdsForTab(panes, tabId));
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

export type FocusDirection = "left" | "right" | "up" | "down";

const findEdgeMosaicPaneId = (
	node: MosaicNode<string>,
	dir: FocusDirection,
	alignmentPath: MosaicBranch[] = [],
): string => {
	if (typeof node === "string") return node;
	const axis: "row" | "column" =
		dir === "left" || dir === "right" ? "row" : "column";
	if (node.direction === axis) {
		const nearEdge: MosaicBranch =
			dir === "right" || dir === "down" ? "first" : "second";
		return findEdgeMosaicPaneId(node[nearEdge], dir, alignmentPath);
	}
	const [alignedBranch = "first", ...rest] = alignmentPath;
	return findEdgeMosaicPaneId(node[alignedBranch], dir, rest);
};

const getMosaicNodeAtPath = (
	node: MosaicNode<string>,
	path: MosaicBranch[],
): MosaicNode<string> | null => {
	let current: MosaicNode<string> = node;
	for (const branch of path) {
		if (typeof current === "string") return null;
		current = current[branch];
	}
	return current;
};

/**
 * Visually adjacent pane in `dir`, or null at the outer edge of the grid.
 * Preserves cross-axis alignment when descending through perpendicular splits.
 */
export const getSpatialNeighborMosaicPaneId = (
	root: MosaicNode<string>,
	paneId: string,
	dir: FocusDirection,
): string | null => {
	const path = findPanePath(root, paneId);
	if (!path) return null;

	const axis: "row" | "column" =
		dir === "left" || dir === "right" ? "row" : "column";
	const wantSecond = dir === "right" || dir === "down";

	for (let i = path.length - 1; i >= 0; i--) {
		const ancestor = getMosaicNodeAtPath(root, path.slice(0, i));
		if (!ancestor || typeof ancestor === "string") continue;
		if (ancestor.direction !== axis) continue;
		const cameFrom = path[i];
		if (wantSecond && cameFrom !== "first") continue;
		if (!wantSecond && cameFrom !== "second") continue;
		const siblingBranch: MosaicBranch = wantSecond ? "second" : "first";
		return findEdgeMosaicPaneId(
			ancestor[siblingBranch],
			dir,
			path.slice(i + 1),
		);
	}
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
 * Counts the number of leaf panes in a mosaic subtree.
 */
const countLeaves = (node: MosaicNode<string>): number => {
	if (typeof node === "string") return 1;
	return countLeaves(node.first) + countLeaves(node.second);
};

/**
 * Recursively sets split percentages so all leaf panes get equal space.
 * Each split is proportional to the number of leaves on each side.
 */
export const equalizeSplitPercentages = (
	node: MosaicNode<string>,
): MosaicNode<string> => {
	if (typeof node === "string") return node;
	const leftLeaves = countLeaves(node.first);
	const rightLeaves = countLeaves(node.second);
	return {
		...node,
		splitPercentage: (leftLeaves / (leftLeaves + rightLeaves)) * 100,
		first: equalizeSplitPercentages(node.first),
		second: equalizeSplitPercentages(node.second),
	};
};

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

export const fileViewerTargetsMatch = (
	fileViewer:
		| Pick<FileViewerState, "filePath" | "diffCategory" | "commitHash">
		| undefined,
	options: Pick<
		AddFileViewerPaneOptions,
		"filePath" | "diffCategory" | "commitHash"
	>,
): boolean => {
	if (!fileViewer) {
		return false;
	}

	const normalizeRemoteFileTarget = (value: string): string => {
		return value.endsWith("/") && !value.endsWith("://")
			? value.slice(0, -1)
			: value;
	};
	const filePathsMatch =
		isRemotePath(fileViewer.filePath) || isRemotePath(options.filePath)
			? normalizeRemoteFileTarget(fileViewer.filePath) ===
				normalizeRemoteFileTarget(options.filePath)
			: pathsMatch(fileViewer.filePath, options.filePath);

	return (
		filePathsMatch &&
		fileViewer.diffCategory === options.diffCategory &&
		fileViewer.commitHash === options.commitHash
	);
};

const getWorkspaceTabIdsByReusePreference = ({
	workspaceId,
	activeTabId,
	tabs,
	tabHistoryStacks,
	reuseExisting,
}: {
	workspaceId: string;
	activeTabId: string | null;
	tabs: Tab[];
	tabHistoryStacks: Record<string, string[] | undefined>;
	reuseExisting: FileViewerReuseScope;
}): string[] => {
	if (reuseExisting === "none") {
		return [];
	}

	const workspaceTabs = tabs.filter((tab) => tab.workspaceId === workspaceId);
	if (workspaceTabs.length === 0) {
		return [];
	}

	if (reuseExisting === "active-tab") {
		return activeTabId && workspaceTabs.some((tab) => tab.id === activeTabId)
			? [activeTabId]
			: [];
	}

	const orderedTabIds: string[] = [];
	const seenTabIds = new Set<string>();
	const addTabId = (tabId: string | null | undefined): void => {
		if (!tabId || seenTabIds.has(tabId)) {
			return;
		}
		if (!workspaceTabs.some((tab) => tab.id === tabId)) {
			return;
		}
		seenTabIds.add(tabId);
		orderedTabIds.push(tabId);
	};

	addTabId(activeTabId);
	for (const tabId of tabHistoryStacks[workspaceId] ?? []) {
		addTabId(tabId);
	}
	for (const tab of workspaceTabs) {
		addTabId(tab.id);
	}

	return orderedTabIds;
};

export const findReusableFileViewerPane = ({
	workspaceId,
	activeTabId,
	tabs,
	panes,
	tabHistoryStacks,
	reuseExisting,
	options,
}: {
	workspaceId: string;
	activeTabId: string | null;
	tabs: Tab[];
	panes: Record<string, Pane>;
	tabHistoryStacks: Record<string, string[] | undefined>;
	reuseExisting: FileViewerReuseScope;
	options: Pick<
		AddFileViewerPaneOptions,
		"filePath" | "diffCategory" | "commitHash"
	>;
}): Pane | null => {
	const orderedTabIds = getWorkspaceTabIdsByReusePreference({
		workspaceId,
		activeTabId,
		tabs,
		tabHistoryStacks,
		reuseExisting,
	});

	for (const tabId of orderedTabIds) {
		const tab = tabs.find((candidate) => candidate.id === tabId);
		if (!tab) {
			continue;
		}

		for (const paneId of extractPaneIdsFromLayout(tab.layout)) {
			const pane = panes[paneId];
			if (
				pane?.type === "file-viewer" &&
				fileViewerTargetsMatch(pane.fileViewer, options)
			) {
				return pane;
			}
		}
	}

	return null;
};

export const applyFileViewerOpenOptionsToPane = (
	pane: Pane,
	options: AddFileViewerPaneOptions,
): Pane => {
	if (pane.type !== "file-viewer" || !pane.fileViewer) {
		return pane;
	}

	const nextFileViewer: FileViewerState = {
		...pane.fileViewer,
		viewMode: options.viewMode ?? pane.fileViewer.viewMode,
		isPinned: pane.fileViewer.isPinned || (options.isPinned ?? false),
		oldPath: options.oldPath ?? pane.fileViewer.oldPath,
		initialLine: options.line ?? pane.fileViewer.initialLine,
		initialColumn: options.column ?? pane.fileViewer.initialColumn,
		displayName: options.displayName ?? pane.fileViewer.displayName,
	};

	const nextName = pane.userTitle?.trim()
		? pane.name
		: nextFileViewer.displayName || getPathBaseName(nextFileViewer.filePath);

	if (
		nextName === pane.name &&
		nextFileViewer.viewMode === pane.fileViewer.viewMode &&
		nextFileViewer.isPinned === pane.fileViewer.isPinned &&
		nextFileViewer.oldPath === pane.fileViewer.oldPath &&
		nextFileViewer.initialLine === pane.fileViewer.initialLine &&
		nextFileViewer.initialColumn === pane.fileViewer.initialColumn &&
		nextFileViewer.displayName === pane.fileViewer.displayName
	) {
		return pane;
	}

	return {
		...pane,
		name: nextName,
		fileViewer: nextFileViewer,
	};
};

export const activatePaneInWorkspace = ({
	workspaceId,
	paneId,
	tabs,
	panes,
	activeTabIds,
	focusedPaneIds,
	tabHistoryStacks,
}: {
	workspaceId: string;
	paneId: string;
	tabs: Tab[];
	panes: Record<string, Pane>;
	activeTabIds: TabsState["activeTabIds"];
	focusedPaneIds: TabsState["focusedPaneIds"];
	tabHistoryStacks: TabsState["tabHistoryStacks"];
}): Pick<
	TabsState,
	"activeTabIds" | "focusedPaneIds" | "tabHistoryStacks" | "panes"
> | null => {
	const pane = panes[paneId];
	if (!pane) {
		return null;
	}

	const tab = tabs.find((candidate) => candidate.id === pane.tabId);
	if (!tab || tab.workspaceId !== workspaceId) {
		return null;
	}

	const nextPanes = { ...panes };
	let hasPaneChanges = false;
	for (const tabPaneId of extractPaneIdsFromLayout(tab.layout)) {
		const currentPane = nextPanes[tabPaneId];
		if (!currentPane) {
			continue;
		}

		const resolvedStatus = acknowledgedStatus(currentPane.status);
		if (resolvedStatus !== (currentPane.status ?? "idle")) {
			nextPanes[tabPaneId] = { ...currentPane, status: resolvedStatus };
			hasPaneChanges = true;
		}
	}

	return {
		panes: hasPaneChanges ? nextPanes : panes,
		activeTabIds: {
			...activeTabIds,
			[workspaceId]: tab.id,
		},
		focusedPaneIds: {
			...focusedPaneIds,
			[tab.id]: paneId,
		},
		tabHistoryStacks: {
			...tabHistoryStacks,
			[workspaceId]: updateHistoryStack(
				tabHistoryStacks[workspaceId] ?? [],
				activeTabIds[workspaceId] ?? null,
				tab.id,
			),
		},
	};
};
