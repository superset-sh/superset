import type { MosaicNode } from "react-mosaic-component";
import type { Pane, TerminalPane, WebviewPane, Window } from "./types";

/**
 * Generates a unique ID with the given prefix
 */
export const generateId = (prefix: string): string => {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

/**
 * Gets the display name for a window
 * Now just returns the stored name since names are static at creation
 */
export const getWindowDisplayName = (window: Window): string => {
	return window.name || "Window";
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
 * Creates a new terminal pane
 */
export const createPane = (windowId: string): TerminalPane => {
	const id = generateId("pane");

	return {
		id,
		windowId,
		type: "terminal",
		name: "Terminal",
		isNew: true,
	};
};

/**
 * Creates a new webview pane for cloud workspaces
 */
export const createWebviewPane = (
	windowId: string,
	url: string,
	name?: string,
): WebviewPane => {
	const id = generateId("pane");

	// Derive name from URL if not provided
	const derivedName = name || getWebviewNameFromUrl(url);

	return {
		id,
		windowId,
		type: "webview",
		name: derivedName,
		url,
		isNew: true,
	};
};

/**
 * Extract a friendly name from a cloud URL
 * URLs look like: https://7030-sandboxid.e2b.app or https://8888-sandboxid.e2b.app
 */
const getWebviewNameFromUrl = (url: string): string => {
	const portMatch = url.match(/(\d+)-[a-z0-9-]+\.e2b\.app/);
	if (portMatch) {
		const port = portMatch[1];
		// 7030 = claude agent, 8888 = webssh terminal
		if (port === "7030") return "Cloud Agent";
		if (port === "8888") return "Cloud SSH";
		return `Cloud (${port})`;
	}
	return "Cloud View";
};

/**
 * Generates a static window name based on existing windows
 * (e.g., "Window 1", "Window 2", finding the next available number)
 */
export const generateWindowName = (existingWindows: Window[]): string => {
	const existingNumbers = existingWindows
		.map((w) => {
			const match = w.name.match(/^Window (\d+)$/);
			return match ? Number.parseInt(match[1], 10) : 0;
		})
		.filter((n) => n > 0);

	// Find the next available number
	let nextNumber = 1;
	while (existingNumbers.includes(nextNumber)) {
		nextNumber++;
	}

	return `Window ${nextNumber}`;
};

/**
 * Creates a new window with an initial pane atomically
 * This ensures the invariant that windows always have at least one pane
 */
export const createWindowWithPane = (
	workspaceId: string,
	existingWindows: Window[] = [],
): { window: Window; pane: Pane } => {
	const windowId = generateId("win");
	const pane = createPane(windowId);

	// Filter to same workspace for window naming
	const workspaceWindows = existingWindows.filter(
		(w) => w.workspaceId === workspaceId,
	);

	const window: Window = {
		id: windowId,
		name: generateWindowName(workspaceWindows),
		workspaceId,
		layout: pane.id, // Single pane = leaf node
		createdAt: Date.now(),
	};

	return { window, pane };
};

/**
 * Gets all pane IDs that belong to a specific window
 */
export const getPaneIdsForWindow = (
	panes: Record<string, Pane>,
	windowId: string,
): string[] => {
	return Object.values(panes)
		.filter((pane) => pane.windowId === windowId)
		.map((pane) => pane.id);
};

/**
 * Checks if a window has only one pane remaining
 */
export const isLastPaneInWindow = (
	panes: Record<string, Pane>,
	windowId: string,
): boolean => {
	return getPaneIdsForWindow(panes, windowId).length === 1;
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
 * Creates a cloud window with split view (Agent on left, SSH on right)
 */
export const createCloudWindowWithPanes = (
	workspaceId: string,
	agentUrl: string,
	sshUrl: string,
): { window: Window; agentPane: WebviewPane; sshPane: WebviewPane } => {
	const windowId = generateId("win");
	const agentPane = createWebviewPane(windowId, agentUrl, "Cloud Agent");
	const sshPane = createWebviewPane(windowId, sshUrl, "Cloud SSH");

	// Split layout: agent on left (60%), ssh on right (40%)
	const layout: MosaicNode<string> = {
		direction: "row",
		first: agentPane.id,
		second: sshPane.id,
		splitPercentage: 60,
	};

	const window: Window = {
		id: windowId,
		name: "Cloud",
		workspaceId,
		layout,
		createdAt: Date.now(),
	};

	return { window, agentPane, sshPane };
};
