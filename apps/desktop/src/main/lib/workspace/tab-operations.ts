import { randomUUID } from "node:crypto";

import type {
	CreateTabInput,
	MosaicNode,
	Tab,
	UpdatePreviewTabInput,
	Workspace,
	Worktree,
} from "shared/types";

import configManager from "../config-manager";
import { cleanupEmptyGroupsInWorktree } from "./group-cleanup";
import {
	findParentTab,
	findTab,
	isValidParentTab,
	removeTabFromMosaicTree,
	removeTabRecursive,
} from "./tab-helpers";

/**
 * Create a new tab in a worktree or inside a parent tab
 */
export async function createTab(
	workspace: Workspace,
	input: CreateTabInput,
): Promise<{ success: boolean; tab?: Tab; error?: string }> {
	try {
		const worktree = workspace.worktrees.find(
			(wt) => wt.id === input.worktreeId,
		);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		const tab: Tab = {
			id: randomUUID(),
			name: input.name,
			type: input.type || "terminal", // Default to terminal if not specified
			createdAt: new Date().toISOString(),
		};

		// Type-specific properties
		if (tab.type === "terminal") {
			tab.command = input.command;
		} else if (tab.type === "preview" || tab.type === "browser") {
			tab.url = input.url;
		} else if (tab.type === "group") {
			tab.tabs = [];
			tab.mosaicTree = undefined; // Will be set when tabs are added
		}

		// Handle copying from existing tab (for split operations)
		if (input.copyFromTabId) {
			const sourceTab = findTab(worktree.tabs, input.copyFromTabId);
			if (sourceTab && sourceTab.type === tab.type) {
				// Copy relevant properties based on type
				if (tab.type === "terminal") {
					tab.command = sourceTab.command;
					tab.cwd = sourceTab.cwd;
				} else if (tab.type === "preview" || tab.type === "browser") {
					tab.url = sourceTab.url;
				}
			}
		}

		// Add tab to parent or worktree
		if (input.parentTabId) {
			const parentTab = findTab(worktree.tabs, input.parentTabId);
			if (!isValidParentTab(parentTab)) {
				return {
					success: false,
					error: "Parent tab not found or not a group",
				};
			}

			// Validate: prevent nested group tabs
			if (tab.type === "group") {
				return {
					success: false,
					error: "Cannot create group tab inside another group tab",
				};
			}

			parentTab!.tabs = parentTab!.tabs || [];
			parentTab!.tabs.push(tab);
		} else {
			// Top-level tab in worktree
			worktree.tabs.push(tab);
		}

		workspace.updatedAt = new Date().toISOString();

		// Save
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true, tab };
	} catch (error) {
		console.error("Failed to create tab:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Update preview tab URL
 */
export async function updatePreviewTabUrl(
	workspace: Workspace,
	input: UpdatePreviewTabInput,
): Promise<{ success: boolean; error?: string }> {
	try {
		const worktree = workspace.worktrees.find(
			(wt) => wt.id === input.worktreeId,
		);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		const tab = findTab(worktree.tabs, input.tabId);
		if (!tab) {
			return { success: false, error: "Tab not found" };
		}

		if (tab.type !== "preview" && tab.type !== "browser") {
			return { success: false, error: "Tab is not a preview" };
		}

		tab.url = input.url;
		workspace.updatedAt = new Date().toISOString();

		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to update preview tab URL:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Delete a tab from a worktree
 * Also removes the tab from the parent group's mosaic tree if applicable
 */
export async function deleteTab(
	workspace: Workspace,
	input: {
		worktreeId: string;
		tabId: string;
	},
): Promise<{ success: boolean; error?: string }> {
	try {
		const worktree = workspace.worktrees.find(
			(wt) => wt.id === input.worktreeId,
		);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		// Find the parent tab (if this tab is inside a group)
		const parentTab = findParentTab(worktree.tabs, input.tabId);

		// Remove from the tabs array
		if (!removeTabRecursive(worktree.tabs, input.tabId)) {
			return { success: false, error: "Tab not found" };
		}

		// If the tab was inside a group, update the parent's mosaic tree
		if (parentTab && parentTab.type === "group" && parentTab.mosaicTree) {
			const updatedTree = removeTabFromMosaicTree(
				parentTab.mosaicTree,
				input.tabId,
			);
			parentTab.mosaicTree = updatedTree === null ? undefined : updatedTree;
		}

		// Clean up any empty group tabs (including the parent if it became empty)
		cleanupEmptyGroupsInWorktree(workspace, input.worktreeId);

		workspace.updatedAt = new Date().toISOString();

		// Save
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to delete tab:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Reorder tabs within a parent tab or at worktree level
 * Note: With mosaic layout, the visual layout is handled by the mosaicTree property.
 * This function just reorders the tabs array for sidebar display purposes.
 */
export async function reorderTabs(
	workspace: Workspace,
	input: {
		worktreeId: string;
		parentTabId?: string;
		tabIds: string[];
	},
): Promise<{ success: boolean; error?: string }> {
	try {
		const worktree = workspace.worktrees.find(
			(wt) => wt.id === input.worktreeId,
		);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		let tabs: Tab[];

		if (input.parentTabId) {
			// Reorder tabs inside a parent group
			const parentTab = findTab(worktree.tabs, input.parentTabId);
			if (!isValidParentTab(parentTab)) {
				return {
					success: false,
					error: "Parent tab not found or not a group",
				};
			}
			tabs = parentTab!.tabs || [];
		} else {
			// Reorder tabs at worktree level
			tabs = worktree.tabs;
		}

		// Reorder tabs based on tabIds array
		const reorderedTabs = input.tabIds
			.map((id) => tabs.find((t) => t.id === id))
			.filter((t): t is Tab => t !== undefined);

		// Verify all tabs are present
		if (reorderedTabs.length !== tabs.length) {
			return { success: false, error: "Tab count mismatch during reorder" };
		}

		// Update the tabs array
		if (input.parentTabId) {
			const parentTab = findTab(worktree.tabs, input.parentTabId);
			parentTab!.tabs = reorderedTabs;
		} else {
			worktree.tabs = reorderedTabs;
		}

		workspace.updatedAt = new Date().toISOString();

		// Save
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to reorder tabs:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Move a tab from one parent to another
 * Note: With mosaic layout, the visual layout is handled by the mosaicTree property.
 * This function just moves tabs between arrays for organizational purposes.
 */
export async function moveTab(
	workspace: Workspace,
	input: {
		worktreeId: string;
		tabId: string;
		sourceParentTabId?: string;
		targetParentTabId?: string;
		targetIndex: number;
	},
): Promise<{ success: boolean; error?: string }> {
	try {
		const worktree = workspace.worktrees.find(
			(wt) => wt.id === input.worktreeId,
		);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		// Find source and target tab arrays
		let sourceTabs: Tab[];
		let targetTabs: Tab[];

		if (input.sourceParentTabId) {
			const sourceParent = findTab(worktree.tabs, input.sourceParentTabId);
			if (!isValidParentTab(sourceParent)) {
				return { success: false, error: "Source parent tab not found" };
			}
			sourceTabs = sourceParent!.tabs || [];
		} else {
			sourceTabs = worktree.tabs;
		}

		if (input.targetParentTabId) {
			const targetParent = findTab(worktree.tabs, input.targetParentTabId);
			if (!isValidParentTab(targetParent)) {
				return { success: false, error: "Target parent tab not found" };
			}
			targetTabs = targetParent!.tabs || [];
		} else {
			targetTabs = worktree.tabs;
		}

		// Find and remove the tab from source
		const tabIndex = sourceTabs.findIndex((t) => t.id === input.tabId);
		if (tabIndex === -1) {
			return { success: false, error: "Tab not found in source" };
		}

		const [tab] = sourceTabs.splice(tabIndex, 1);

		// Insert into target at specified index
		targetTabs.splice(input.targetIndex, 0, tab);

		// Clean up any empty groups that may have been left behind
		cleanupEmptyGroupsInWorktree(workspace, input.worktreeId);

		workspace.updatedAt = new Date().toISOString();

		// Save
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to move tab:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Update mosaic tree for a group tab
 */
export async function updateTabMosaicTree(
	workspace: Workspace,
	input: {
		worktreeId: string;
		tabId: string;
		mosaicTree: MosaicNode<string> | null | undefined;
	},
): Promise<{ success: boolean; error?: string }> {
	try {
		const worktree = workspace.worktrees.find(
			(wt) => wt.id === input.worktreeId,
		);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		const tab = findTab(worktree.tabs, input.tabId);
		if (!tab) {
			return { success: false, error: "Tab not found" };
		}

		if (tab.type !== "group") {
			return { success: false, error: "Tab is not a group" };
		}

		// Update mosaic tree
		tab.mosaicTree = input.mosaicTree || undefined;

		workspace.updatedAt = new Date().toISOString();

		// Save
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to update tab mosaic tree:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Update terminal CWD for a tab
 */
export async function updateTerminalCwd(
	workspace: Workspace,
	input: {
		worktreeId: string;
		tabId: string;
		cwd: string;
	},
): Promise<boolean> {
	try {
		const worktree = workspace.worktrees.find(
			(wt) => wt.id === input.worktreeId,
		);
		if (!worktree) {
			return false;
		}

		const tab = findTab(worktree.tabs, input.tabId);
		if (!tab || tab.type !== "terminal") {
			return false;
		}

		tab.cwd = input.cwd;
		workspace.updatedAt = new Date().toISOString();

		// Save
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return true;
	} catch (error) {
		console.error("Failed to update terminal CWD:", error);
		return false;
	}
}

/**
 * Update tab name
 */
export async function updateTabName(
	workspace: Workspace,
	input: {
		worktreeId: string;
		tabId: string;
		name: string;
	},
): Promise<{ success: boolean; error?: string }> {
	try {
		const worktree = workspace.worktrees.find(
			(wt) => wt.id === input.worktreeId,
		);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		const tab = findTab(worktree.tabs, input.tabId);
		if (!tab) {
			return { success: false, error: "Tab not found" };
		}

		tab.name = input.name;
		workspace.updatedAt = new Date().toISOString();

		// Save
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to update tab name:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
