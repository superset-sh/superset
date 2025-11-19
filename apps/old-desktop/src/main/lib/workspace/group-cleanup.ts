import type { Tab, Workspace } from "shared/types";
import { findTab } from "./tab-helpers";

/**
 * Check if a group tab is empty (has no child tabs)
 */
export function isEmptyGroup(tab: Tab): boolean {
	return tab.type === "group" && (!tab.tabs || tab.tabs.length === 0);
}

/**
 * Remove all empty group tabs from a worktree
 * Returns true if any groups were removed
 */
export function removeEmptyGroupTabs(
	tabs: Tab[],
	parentPath: string[] = [],
): boolean {
	let removedAny = false;

	// Iterate backwards to safely remove items
	for (let i = tabs.length - 1; i >= 0; i--) {
		const tab = tabs[i];

		if (isEmptyGroup(tab)) {
			// Remove this empty group
			tabs.splice(i, 1);
			removedAny = true;
		} else if (tab.type === "group" && tab.tabs) {
			// Recursively check child tabs
			const childRemoved = removeEmptyGroupTabs(tab.tabs, [
				...parentPath,
				tab.name,
			]);
			if (childRemoved) {
				removedAny = true;
			}

			// After recursion, check if this group became empty
			if (isEmptyGroup(tab)) {
				tabs.splice(i, 1);
				removedAny = true;
			}
		}
	}

	return removedAny;
}

/**
 * Clean up empty group tabs in a specific worktree
 * Returns true if any groups were removed
 */
export function cleanupEmptyGroupsInWorktree(
	workspace: Workspace,
	worktreeId: string,
): boolean {
	const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
	if (!worktree) {
		return false;
	}

	return removeEmptyGroupTabs(worktree.tabs);
}

/**
 * Clean up empty group tabs in all worktrees
 * Returns the number of worktrees that had groups removed
 */
export function cleanupEmptyGroupsInAllWorktrees(workspace: Workspace): number {
	let worktreesAffected = 0;

	for (const worktree of workspace.worktrees) {
		const removed = removeEmptyGroupTabs(worktree.tabs);
		if (removed) {
			worktreesAffected++;
		}
	}

	return worktreesAffected;
}

/**
 * Remove a specific empty group tab and return true if it was removed
 */
export function removeEmptyGroupIfEmpty(
	tabs: Tab[],
	groupTabId: string,
): boolean {
	const groupTab = findTab(tabs, groupTabId);
	if (!groupTab || !isEmptyGroup(groupTab)) {
		return false;
	}

	// Find and remove the group tab
	const removeRecursive = (tabArray: Tab[]): boolean => {
		const index = tabArray.findIndex((t) => t.id === groupTabId);
		if (index !== -1) {
			tabArray.splice(index, 1);
			return true;
		}

		// Check child tabs
		for (const tab of tabArray) {
			if (tab.type === "group" && tab.tabs) {
				if (removeRecursive(tab.tabs)) {
					return true;
				}
			}
		}

		return false;
	};

	return removeRecursive(tabs);
}
