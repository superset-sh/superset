import type { MosaicNode, Tab } from "shared/types";

/**
 * Renderer-side utility functions for tab operations
 */

/**
 * Find a tab recursively (for finding sub-tabs inside groups)
 * Returns the tab and its parent (if it's a sub-tab)
 */
export function findTabRecursive(
    tabs: Tab[] | undefined,
    tabId: string,
): { tab: Tab; parent?: Tab } | null {
    if (!tabs) return null;

    for (const tab of tabs) {
        if (tab.id === tabId) {
            return { tab };
        }
        // Check if this tab is a group tab with children
        if (tab.type === "group" && tab.tabs) {
            for (const childTab of tab.tabs) {
                if (childTab.id === tabId) {
                    return { tab: childTab, parent: tab };
                }
            }
        }
    }
    return null;
}

/**
 * Recursively find a tab by ID
 */
export function findTabById(tabs: Tab[], tabId: string): Tab | null {
    for (const tab of tabs) {
        if (tab.id === tabId) return tab;
        if (tab.type === "group" && tab.tabs) {
            const found = findTabById(tab.tabs, tabId);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Remove tab ID from mosaic tree
 */
export function removeTabFromMosaicTree(
    tree: MosaicNode<string>,
    tabId: string,
): MosaicNode<string> | null {
    if (typeof tree === "string") {
        // If this is the tab to remove, return null
        return tree === tabId ? null : tree;
    }

    // Recursively remove from branches
    const newFirst = removeTabFromMosaicTree(tree.first, tabId);
    const newSecond = removeTabFromMosaicTree(tree.second, tabId);

    // If both branches are gone, return null
    if (!newFirst && !newSecond) {
        return null;
    }

    // If one branch is gone, return the other
    if (!newFirst) {
        return newSecond;
    }
    if (!newSecond) {
        return newFirst;
    }

    // Both branches exist, keep the structure
    return {
        ...tree,
        first: newFirst,
        second: newSecond,
    };
}

/**
 * Add tab ID to mosaic tree
 */
export function addTabToMosaicTree(
    tree: MosaicNode<string> | null | undefined,
    tabId: string,
): MosaicNode<string> {
    if (!tree) {
        return tabId;
    }

    if (typeof tree === "string") {
        // Prevent duplicate IDs - if the tree already contains this tab ID, just return the tree
        if (tree === tabId) {
            console.warn(
                `[MainScreen] Attempted to add duplicate tab ID "${tabId}" to mosaic tree`,
            );
            return tree;
        }

        // Single tab - create a split
        return {
            direction: "row",
            first: tree,
            second: tabId,
            splitPercentage: 50,
        };
    }

    // Check if the tab ID already exists in the tree (recursively)
    const containsTabId = (node: MosaicNode<string>): boolean => {
        if (typeof node === "string") {
            return node === tabId;
        }
        return containsTabId(node.first) || containsTabId(node.second);
    };

    if (containsTabId(tree)) {
        console.warn(
            `[MainScreen] Tab ID "${tabId}" already exists in mosaic tree, skipping addition`,
        );
        return tree;
    }

    // Tree node - add to the second branch
    return {
        ...tree,
        second: addTabToMosaicTree(tree.second, tabId),
    };
}

