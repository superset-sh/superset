import { randomUUID } from "node:crypto";
import type { MosaicNode, Tab } from "shared/types";

/**
 * Helper functions for working with tabs
 */

/**
 * Find a tab by ID recursively in a tab tree
 */
export function findTab(tabs: Tab[], tabId: string): Tab | null {
	for (const tab of tabs) {
		if (tab.id === tabId) {
			return tab;
		}
		if (tab.type === "group" && tab.tabs) {
			const found = findTab(tab.tabs, tabId);
			if (found) return found;
		}
	}
	return null;
}

/**
 * Find the parent tab of a given tab ID
 */
export function findParentTab(tabs: Tab[], tabId: string): Tab | null {
	for (const tab of tabs) {
		if (tab.type === "group" && tab.tabs) {
			if (tab.tabs.some((t) => t.id === tabId)) {
				return tab;
			}
			const found = findParentTab(tab.tabs, tabId);
			if (found) return found;
		}
	}
	return null;
}

/**
 * Remove a tab from a tab tree recursively
 * Returns true if the tab was found and removed
 */
export function removeTabRecursive(tabs: Tab[], tabId: string): boolean {
	const tabIndex = tabs.findIndex((t) => t.id === tabId);
	if (tabIndex !== -1) {
		tabs.splice(tabIndex, 1);
		return true;
	}

	// Search in nested tabs
	for (const tab of tabs) {
		if (tab.type === "group" && tab.tabs) {
			if (removeTabRecursive(tab.tabs, tabId)) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Validate that a tab can be a parent (must be a group type)
 */
export function isValidParentTab(tab: Tab | null): boolean {
	return tab !== null && tab.type === "group";
}

/**
 * Remove a tab ID from a mosaic tree
 * Returns the updated tree, or null if the tree becomes empty
 */
export function removeTabFromMosaicTree(
	tree: MosaicNode<string> | null | undefined,
	tabId: string,
): MosaicNode<string> | null {
	if (!tree) return null;

	// If the tree is just a single tab ID
	if (typeof tree === "string") {
		return tree === tabId ? null : tree;
	}

	// Tree is a parent node with splits
	const firstResult = removeTabFromMosaicTree(tree.first, tabId);
	const secondResult = removeTabFromMosaicTree(tree.second, tabId);

	// If both sides are removed, return null
	if (firstResult === null && secondResult === null) {
		return null;
	}

	// If first side is removed, return second side
	if (firstResult === null) {
		return secondResult;
	}

	// If second side is removed, return first side
	if (secondResult === null) {
		return firstResult;
	}

	// Both sides still exist, return updated tree
	return {
		...tree,
		first: firstResult,
		second: secondResult,
	};
}

/**
 * Get all tab IDs from a mosaic tree
 */
export function getTabIdsFromMosaicTree(
	tree: MosaicNode<string> | null | undefined,
): string[] {
	if (!tree) return [];

	// If the tree is just a single tab ID
	if (typeof tree === "string") {
		return [tree];
	}

	// Tree is a parent node with splits
	return [
		...getTabIdsFromMosaicTree(tree.first),
		...getTabIdsFromMosaicTree(tree.second),
	];
}

/**
 * Clone tabs with new unique IDs
 * This is used when cloning tab setup to a new worktree
 */
export function cloneTabsWithNewIds(tabs: Tab[]): Tab[] {
	// Map to track old ID -> new ID mappings
	const idMap = new Map<string, string>();

	/**
	 * Recursively clone a single tab and all its children
	 */
	function cloneTab(tab: Tab): Tab {
		const newId = randomUUID();
		idMap.set(tab.id, newId);

		const clonedTab: Tab = {
			...tab,
			id: newId,
			createdAt: new Date().toISOString(),
		};

		// Clone child tabs recursively if this is a group
		if (tab.type === "group" && tab.tabs) {
			clonedTab.tabs = tab.tabs.map((childTab) => cloneTab(childTab));

			// Update mosaic tree with new IDs
			if (tab.mosaicTree) {
				clonedTab.mosaicTree = updateMosaicTreeIds(tab.mosaicTree, idMap);
			}
		}

		return clonedTab;
	}

	/**
	 * Update all tab IDs in a mosaic tree using the ID map
	 */
	function updateMosaicTreeIds(
		tree: MosaicNode<string>,
		idMapping: Map<string, string>,
	): MosaicNode<string> {
		// If the tree is just a single tab ID
		if (typeof tree === "string") {
			return idMapping.get(tree) || tree;
		}

		// Tree is a parent node with splits
		return {
			...tree,
			first: updateMosaicTreeIds(tree.first, idMapping),
			second: updateMosaicTreeIds(tree.second, idMapping),
		};
	}

	return tabs.map((tab) => cloneTab(tab));
}
