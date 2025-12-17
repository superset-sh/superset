import type { MosaicBranch, MosaicNode } from "react-mosaic-component";
import type { Pane, PaneType, Tab } from "./types";

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
	return tab.name || "Terminal";
};

/**
 * Extracts all pane IDs from a mosaic layout tree
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

	// Find the next available number
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

	// Recursively remove from both branches
	const newFirst = removePaneFromLayout(layout.first, paneIdToRemove);
	const newSecond = removePaneFromLayout(layout.second, paneIdToRemove);

	// If both branches are gone, return null
	if (!newFirst && !newSecond) return null;

	// If one branch is gone, return the other
	if (!newFirst) return newSecond;
	if (!newSecond) return newFirst;

	// Both branches still exist, return updated layout
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
