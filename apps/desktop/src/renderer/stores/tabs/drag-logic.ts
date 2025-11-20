import type { MosaicNode } from "react-mosaic-component";
import { type Tab, type TabGroup, TabType } from "./types";
import { createNewTab } from "./utils";

export interface DragTabToTabResult {
	tabs: Tab[];
	activeTabIds: Record<string, string | null>;
	tabHistoryStacks: Record<string, string[]>;
}

/**
 * Removes a tab ID from a mosaic layout tree
 * Returns null if the layout becomes empty after removal
 */
export const removeTabFromLayout = (
	layout: MosaicNode<string> | null,
	tabIdToRemove: string,
): MosaicNode<string> | null => {
	if (!layout) return null;

	// If layout is a leaf node (single tab ID)
	if (typeof layout === "string") {
		return layout === tabIdToRemove ? null : layout;
	}

	// Recursively remove from both branches
	const newFirst = removeTabFromLayout(layout.first, tabIdToRemove);
	const newSecond = removeTabFromLayout(layout.second, tabIdToRemove);

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
 * Validates layout against valid tab IDs and removes any invalid references
 */
export const cleanLayout = (
	layout: MosaicNode<string> | null,
	validTabIds: Set<string>,
): MosaicNode<string> | null => {
	if (!layout) return null;

	if (typeof layout === "string") {
		return validTabIds.has(layout) ? layout : null;
	}

	const newFirst = cleanLayout(layout.first, validTabIds);
	const newSecond = cleanLayout(layout.second, validTabIds);

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

const removeFromOldParent = (
	tabs: Tab[],
	tabId: string,
	oldParentId: string,
): Tab[] => {
	return tabs
		.map((tab) => {
			if (tab.id === oldParentId && tab.type === TabType.Group) {
				const updatedLayout = removeTabFromLayout(tab.layout, tabId);

				return {
					...tab,
					layout: updatedLayout,
				};
			}
			return tab;
		})
		.filter((tab) => {
			// Remove the parent group if it no longer has any children
			if (tab.id === oldParentId && tab.type === TabType.Group) {
				// Check if any tabs still have this group as their parent
				const hasChildren = tabs.some(
					(t) => t.parentId === oldParentId && t.id !== tabId,
				);
				return hasChildren;
			}
			return true;
		});
};

const addToParentGroup = (
	parentGroup: TabGroup,
	childTabId: string,
): TabGroup => {
	const newLayout =
		parentGroup.layout === null
			? childTabId
			: {
					direction: "row" as const,
					first: parentGroup.layout,
					second: childTabId,
					splitPercentage: 50,
				};

	return {
		...parentGroup,
		layout: newLayout,
	};
};

export const handleDragTabToTab = (
	draggedTabId: string,
	targetTabId: string,
	state: {
		tabs: Tab[];
		activeTabIds: Record<string, string | null>;
		tabHistoryStacks: Record<string, string[]>;
	},
): DragTabToTabResult => {
	const draggedTab = state.tabs.find((tab) => tab.id === draggedTabId);
	const targetTab = state.tabs.find((tab) => tab.id === targetTabId);

	if (!draggedTab || !targetTab) return state;

	const workspaceId = draggedTab.workspaceId;
	const historyStack = state.tabHistoryStacks[workspaceId] || [];

	// Rule 1: Dragging tab into itself - duplicates standalone tabs but prevents child duplication to preserve group structure
	if (draggedTabId === targetTabId) {
		if (draggedTab.parentId) {
			return state;
		}
		const newTab = createNewTab(workspaceId, TabType.Single);
		return {
			...state,
			tabs: [...state.tabs, newTab],
			activeTabIds: {
				...state.activeTabIds,
				[workspaceId]: newTab.id,
			},
		};
	}

	// Rule 2: Dragging into a child tab - redirects to parent group since child tabs can't be drop targets
	if (targetTab.parentId && draggedTab.type === TabType.Single) {
		const parentGroup = state.tabs.find(
			(tab) => tab.id === targetTab.parentId && tab.type === TabType.Group,
		) as TabGroup | undefined;

		if (!parentGroup) return state;

		if (draggedTab.parentId === parentGroup.id) {
			return state;
		}

		const updatedDraggedTab: Tab = {
			...draggedTab,
			parentId: parentGroup.id,
		};

		const updatedParentGroup = addToParentGroup(parentGroup, draggedTabId);

		let updatedTabs = state.tabs.map((tab) => {
			if (tab.id === parentGroup.id) return updatedParentGroup;
			if (tab.id === draggedTabId) return updatedDraggedTab;
			return tab;
		});

		if (draggedTab.parentId) {
			updatedTabs = removeFromOldParent(
				updatedTabs,
				draggedTabId,
				draggedTab.parentId,
			);
		}

		return {
			...state,
			tabs: updatedTabs,
			activeTabIds: {
				...state.activeTabIds,
				[workspaceId]: parentGroup.id,
			},
			tabHistoryStacks: {
				...state.tabHistoryStacks,
				[workspaceId]: historyStack.filter((id) => id !== draggedTabId),
			},
		};
	}

	// Rule 3: Dragging into a group tab - adds tab to existing split view group
	if (targetTab.type === TabType.Group && draggedTab.type === TabType.Single) {
		if (draggedTab.parentId === targetTabId) {
			return state;
		}

		const updatedDraggedTab: Tab = {
			...draggedTab,
			parentId: targetTabId,
		};

		const updatedTargetTab = addToParentGroup(targetTab, draggedTabId);

		let updatedTabs = state.tabs.map((tab) => {
			if (tab.id === targetTabId) return updatedTargetTab;
			if (tab.id === draggedTabId) return updatedDraggedTab;
			return tab;
		});

		if (draggedTab.parentId) {
			updatedTabs = removeFromOldParent(
				updatedTabs,
				draggedTabId,
				draggedTab.parentId,
			);
		}

		return {
			...state,
			tabs: updatedTabs,
			activeTabIds: {
				...state.activeTabIds,
				[workspaceId]: targetTabId,
			},
			tabHistoryStacks: {
				...state.tabHistoryStacks,
				[workspaceId]: historyStack.filter((id) => id !== draggedTabId),
			},
		};
	}

	// Rule 4: Dragging single tab into another single tab - creates new group container for split view
	if (targetTab.type === TabType.Single && draggedTab.type === TabType.Single) {
		const groupId = `tab-${Date.now()}-group`;

		// Keep original tab IDs stable - just update their parentId
		const updatedTargetTab: Tab = {
			...targetTab,
			parentId: groupId,
		};

		const updatedDraggedTab: Tab = {
			...draggedTab,
			parentId: groupId,
		};

		const newGroupTab: TabGroup = {
			id: groupId,
			title: `${targetTab.title} + ${draggedTab.title}`,
			workspaceId,
			type: TabType.Group,
			layout: {
				direction: "row",
				first: targetTab.id, // Use original ID, not new one
				second: draggedTab.id, // Use original ID, not new one
				splitPercentage: 50,
			},
		};

		// Find target tab's index in workspace to insert group at that position
		const workspaceTabs = state.tabs.filter(
			(t) => t.workspaceId === workspaceId && !t.parentId,
		);
		const targetIndex = workspaceTabs.findIndex((t) => t.id === targetTabId);

		// Update existing tabs to set parentId
		let updatedTabs = state.tabs.map((tab) => {
			if (tab.id === targetTab.id) return updatedTargetTab;
			if (tab.id === draggedTab.id) return updatedDraggedTab;
			return tab;
		});

		// If dragged tab had an old parent, remove it from that parent (and potentially remove the parent group)
		if (draggedTab.parentId) {
			updatedTabs = removeFromOldParent(
				updatedTabs,
				draggedTabId,
				draggedTab.parentId,
			);
		}

		// Filter to get workspace tabs (excluding child tabs)
		const workspaceTabsUpdated = updatedTabs.filter(
			(t) => t.workspaceId === workspaceId && !t.parentId,
		);
		const otherTabsUpdated = updatedTabs.filter(
			(t) => t.workspaceId !== workspaceId || t.parentId,
		);

		// Insert the new group at the target's original index
		workspaceTabsUpdated.splice(targetIndex, 0, newGroupTab);

		return {
			...state,
			tabs: [...otherTabsUpdated, ...workspaceTabsUpdated],
			activeTabIds: {
				...state.activeTabIds,
				[workspaceId]: newGroupTab.id,
			},
			tabHistoryStacks: {
				...state.tabHistoryStacks,
				[workspaceId]: historyStack.filter(
					(id) => id !== draggedTabId && id !== targetTabId,
				),
			},
		};
	}

	return state;
};
