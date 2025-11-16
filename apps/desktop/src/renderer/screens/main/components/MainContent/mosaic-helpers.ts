import type { MosaicNode } from "react-mosaic-component";
import type { Tab } from "shared/types";

/**
 * Validates that a tab can be added to a mosaic without creating duplicates
 */
export function canAddTabToMosaic(
	existingTree: MosaicNode<string> | null | undefined,
	tabId: string,
): boolean {
	if (!existingTree) return true;

	const existingIds = getTabIdsFromTree(existingTree);
	return !existingIds.has(tabId);
}

/**
 * Extracts all tab IDs from a mosaic tree
 */
export function getTabIdsFromTree(tree: MosaicNode<string> | null | undefined): Set<string> {
	const ids = new Set<string>();
	if (!tree) return ids;

	if (typeof tree === "string") {
		ids.add(tree);
	} else {
		const firstIds = getTabIdsFromTree(tree.first);
		const secondIds = getTabIdsFromTree(tree.second);
		firstIds.forEach((id) => ids.add(id));
		secondIds.forEach((id) => ids.add(id));
	}
	return ids;
}

/**
 * Removes a tab ID from a mosaic tree, collapsing branches as needed
 */
export function removeTabFromMosaicTree(
	tree: MosaicNode<string> | null | undefined,
	tabIdToRemove: string,
): MosaicNode<string> | undefined {
	if (!tree) return undefined;

	// If this is a leaf node
	if (typeof tree === "string") {
		return tree === tabIdToRemove ? undefined : tree;
	}

	// Recursively remove from both branches
	const newFirst = removeTabFromMosaicTree(tree.first, tabIdToRemove);
	const newSecond = removeTabFromMosaicTree(tree.second, tabIdToRemove);

	// If both branches are null, return undefined
	if (!newFirst && !newSecond) return undefined;

	// If one branch is null, return the other branch (collapse)
	if (!newFirst) return newSecond;
	if (!newSecond) return newFirst;

	// Both branches exist, keep the split
	return {
		direction: tree.direction,
		first: newFirst,
		second: newSecond,
	} as MosaicNode<string>;
}

/**
 * Inserts a tab into a mosaic tree at a specific position.
 * Automatically removes any existing instance of the tab to prevent duplicates.
 */
export function insertTabIntoMosaicTree(
	existingTree: MosaicNode<string> | null | undefined,
	newTabId: string,
	position: "top" | "right" | "bottom" | "left" | "center",
): MosaicNode<string> {
	// First, remove the tab if it already exists to prevent duplicates
	const treeWithoutNewTab = removeTabFromMosaicTree(existingTree, newTabId);

	// If center, replace the entire tree with just the new tab
	if (position === "center") {
		return newTabId;
	}

	// If no existing tree (or it was just the tab we removed), return the new tab
	if (!treeWithoutNewTab) {
		return newTabId;
	}

	// Create a split based on position
	const direction = position === "top" || position === "bottom" ? "column" : "row";
	const newTabFirst = position === "top" || position === "left";

	return {
		direction,
		first: newTabFirst ? newTabId : treeWithoutNewTab,
		second: newTabFirst ? treeWithoutNewTab : newTabId,
	} as MosaicNode<string>;
}

/**
 * Builds a balanced mosaic tree from an array of tab IDs
 */
export function buildBalancedMosaicTree(
	tabIds: string[],
	depth = 0,
): MosaicNode<string> | undefined {
	if (tabIds.length === 0) return undefined;
	if (tabIds.length === 1) return tabIds[0];

	// Split tabs in half
	const mid = Math.ceil(tabIds.length / 2);
	const firstHalf = tabIds.slice(0, mid);
	const secondHalf = tabIds.slice(mid);

	// Alternate between row and column splits for better layout
	const direction = depth % 2 === 0 ? "row" : "column";

	return {
		direction,
		first: buildBalancedMosaicTree(firstHalf, depth + 1),
		second: buildBalancedMosaicTree(secondHalf, depth + 1),
	} as MosaicNode<string>;
}

/**
 * Creates a simple two-tab mosaic tree
 */
export function createSimpleMosaicTree(
	firstTabId: string,
	secondTabId: string,
	position: "top" | "right" | "bottom" | "left",
): MosaicNode<string> {
	const direction = position === "top" || position === "bottom" ? "column" : "row";
	const newTabFirst = position === "top" || position === "left";

	return {
		direction,
		first: newTabFirst ? secondTabId : firstTabId,
		second: newTabFirst ? firstTabId : secondTabId,
	} as MosaicNode<string>;
}

/**
 * Validates drag-and-drop operation and returns the tab to add
 */
export async function handleTabDropValidation(params: {
	droppedTab: Tab;
	currentTabId?: string;
	sourceWorktreeId: string;
	targetWorktreeId: string;
	workspaceId: string;
	existingTree?: MosaicNode<string> | null | undefined;
}): Promise<{ valid: boolean; tab?: Tab; reason?: string }> {
	const {
		droppedTab,
		currentTabId,
		sourceWorktreeId,
		targetWorktreeId,
		workspaceId,
		existingTree,
	} = params;

	// Prevent dropping a tab onto itself
	if (currentTabId && droppedTab.id === currentTabId) {
		return { valid: false, reason: "Cannot split a tab with itself" };
	}

	// Check if tab already exists in the mosaic tree
	if (existingTree && !canAddTabToMosaic(existingTree, droppedTab.id)) {
		return { valid: false, reason: "Tab already exists in this view" };
	}

	const isDifferentWorktree = sourceWorktreeId !== targetWorktreeId;
	let tabToAdd = droppedTab;

	// If from different worktree, create a copy
	if (isDifferentWorktree) {
		try {
			const result = await window.ipcRenderer.invoke("tab-create", {
				workspaceId,
				worktreeId: targetWorktreeId,
				type: droppedTab.type,
				name: droppedTab.name,
			});

			if (!result.success || !result.tab) {
				return { valid: false, reason: "Failed to create tab copy" };
			}

			tabToAdd = result.tab;
		} catch (error) {
			return { valid: false, reason: `Error creating tab: ${error}` };
		}
	}

	// Final check that IDs don't match
	if (currentTabId && tabToAdd.id === currentTabId) {
		return { valid: false, reason: "Cannot create mosaic with duplicate IDs" };
	}

	return { valid: true, tab: tabToAdd };
}
