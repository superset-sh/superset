import type { MosaicNode } from "react-mosaic-component";
import type { Tab, TabsState } from "../types";
import { TabType } from "../types";
import { handleEmptyGroupRemoval } from "./group-management";
import { validateGroupLayouts } from "./validation";
import { getChildTabIds } from "../utils";
import { removeTabFromLayout } from "../drag-logic";

/**
 * Updates the layout of a tab group
 */
export const handleUpdateTabGroupLayout = (
	state: TabsState,
	id: string,
	layout: MosaicNode<string>,
): Partial<TabsState> => {
	return {
		tabs: state.tabs.map((tab) =>
			tab.id === id && tab.type === TabType.Group
				? { ...tab, layout }
				: tab,
		),
	};
};

/**
 * Adds a child tab to a group
 */
export const handleAddChildTabToGroup = (
	state: TabsState,
	groupId: string,
	childTabId: string,
): Partial<TabsState> => {
	const updatedTabs = state.tabs.map((tab) => {
		if (tab.id === childTabId) {
			return {
				...tab,
				parentId: groupId,
			};
		}
		return tab;
	});

	// Note: This doesn't update layout - caller is responsible for layout updates
	// This is typically used in conjunction with updateTabGroupLayout

	return {
		tabs: updatedTabs,
	};
};

/**
 * Removes a child tab from a group
 */
export const handleRemoveChildTabFromGroup = (
	state: TabsState,
	groupId: string,
	childTabId: string,
): Partial<TabsState> => {
	const group = state.tabs.find(
		(tab) => tab.id === groupId && tab.type === TabType.Group,
	);
	if (!group || group.type !== TabType.Group) return {};

	// Derive children from parentId
	const updatedChildTabIds = getChildTabIds(
		state.tabs,
		groupId,
	).filter((id: string) => id !== childTabId);

	// If no children left, remove both the child and the group
	if (updatedChildTabIds.length === 0) {
		return handleEmptyGroupRemoval(
			state.tabs,
			state.activeTabIds,
			state.tabHistoryStacks,
			group.workspaceId,
			[groupId, childTabId],
		);
	}

	// Validate layouts after removing child tab
	const validatedTabs = validateGroupLayouts(
		state.tabs.filter((tab) => tab.id !== childTabId),
	);

	return {
		tabs: validatedTabs,
	};
};

/**
 * Ungroups a single tab from its parent group
 */
export const handleUngroupTab = (
	state: TabsState,
	tabId: string,
	targetIndex?: number,
): Partial<TabsState> => {
	const tab = state.tabs.find((t) => t.id === tabId);
	if (!tab || !tab.parentId) return {};

	const parentGroup = state.tabs.find(
		(t) => t.id === tab.parentId && t.type === TabType.Group,
	);
	if (!parentGroup || parentGroup.type !== TabType.Group) return {};

	// Remove parentId from the tab
	const updatedTab: Tab = {
		...tab,
		parentId: undefined,
	};

	// Remove tab from parent's layout
	const updatedLayout = removeTabFromLayout(
		parentGroup.layout,
		tabId,
	) as MosaicNode<string> | null;

	// Get remaining children
	const remainingChildren = state.tabs.filter(
		(t) => t.parentId === parentGroup.id && t.id !== tabId,
	);

	const updatedTabs = state.tabs.map((t) => {
		if (t.id === tabId) return updatedTab;
		if (t.id === parentGroup.id && t.type === TabType.Group) {
			return {
				...t,
				layout: updatedLayout,
			};
		}
		return t;
	});

	// If no children left, remove the group
	if (remainingChildren.length === 0) {
		const result = handleEmptyGroupRemoval(
			updatedTabs,
			state.activeTabIds,
			state.tabHistoryStacks,
			tab.workspaceId,
			[parentGroup.id],
			tabId, // Prefer the ungrouped tab as the new active tab
		);

		// Apply reordering if needed
		if (targetIndex !== undefined) {
			const workspaceTabs = result.tabs.filter(
				(t) => t.workspaceId === tab.workspaceId && !t.parentId,
			);
			const otherTabs = result.tabs.filter(
				(t) => t.workspaceId !== tab.workspaceId || t.parentId,
			);

			const tabToMove = workspaceTabs.find((t) => t.id === tabId);
			if (tabToMove) {
				const filteredTabs = workspaceTabs.filter(
					(t) => t.id !== tabId,
				);
				filteredTabs.splice(targetIndex, 0, tabToMove);
				result.tabs = [...otherTabs, ...filteredTabs];
			}
		}

		return result;
	}

	// Validate layouts after removing tab
	let validatedTabs = validateGroupLayouts(updatedTabs);

	// Reorder if targetIndex is provided
	if (targetIndex !== undefined) {
		const workspaceId = tab.workspaceId;
		const workspaceTabs = validatedTabs.filter(
			(t) => t.workspaceId === workspaceId && !t.parentId,
		);
		const otherTabs = validatedTabs.filter(
			(t) => t.workspaceId !== workspaceId || t.parentId,
		);

		const tabToMove = workspaceTabs.find((t) => t.id === tabId);
		if (tabToMove) {
			const filteredTabs = workspaceTabs.filter((t) => t.id !== tabId);
			filteredTabs.splice(targetIndex, 0, tabToMove);
			validatedTabs = [...otherTabs, ...filteredTabs];
		}
	}

	return {
		...state,
		tabs: validatedTabs,
	};
};

/**
 * Ungroups all tabs from a group
 */
export const handleUngroupTabs = (
	state: TabsState,
	groupId: string,
): Partial<TabsState> => {
	const group = state.tabs.find(
		(t) => t.id === groupId && t.type === TabType.Group,
	);
	if (!group || group.type !== TabType.Group) return {};

	// Get all child tabs
	const childTabIds = getChildTabIds(state.tabs, groupId);
	if (childTabIds.length === 0) return {};

	// Find the group's position in the workspace
	const workspaceId = group.workspaceId;
	const workspaceTabs = state.tabs.filter(
		(t) => t.workspaceId === workspaceId && !t.parentId,
	);
	const groupIndex = workspaceTabs.findIndex((t) => t.id === groupId);

	// Remove parentId from all child tabs
	const updatedTabs = state.tabs
		.map((tab) => {
			if (childTabIds.includes(tab.id)) {
				return {
					...tab,
					parentId: undefined,
				};
			}
			return tab;
		})
		// Remove the group tab itself
		.filter((tab) => tab.id !== groupId);

	// Reorder tabs to place ungrouped tabs where the group was
	const newWorkspaceTabs = updatedTabs.filter(
		(t) => t.workspaceId === workspaceId && !t.parentId,
	);
	const otherTabs = updatedTabs.filter(
		(t) => t.workspaceId !== workspaceId || t.parentId,
	);

	// Get the ungrouped child tabs
	const ungroupedTabs = newWorkspaceTabs.filter((t) =>
		childTabIds.includes(t.id),
	);
	// Get tabs that are not the ungrouped children
	const nonUngroupedTabs = newWorkspaceTabs.filter(
		(t) => !childTabIds.includes(t.id),
	);

	// Insert ungrouped tabs at the group's original position
	nonUngroupedTabs.splice(groupIndex, 0, ...ungroupedTabs);

	const finalTabs = [...otherTabs, ...nonUngroupedTabs];

	// Clean up active tab and history if the group was active
	const currentActiveId = state.activeTabIds[workspaceId];
	const historyStack = state.tabHistoryStacks[workspaceId] || [];
	const newHistoryStack = historyStack.filter((id) => id !== groupId);

	const newActiveTabIds = { ...state.activeTabIds };
	if (currentActiveId === groupId) {
		// Set the first ungrouped tab as active
		if (ungroupedTabs.length > 0) {
			newActiveTabIds[workspaceId] = ungroupedTabs[0].id;
		} else if (nonUngroupedTabs.length > 0) {
			newActiveTabIds[workspaceId] = nonUngroupedTabs[0].id;
		} else {
			newActiveTabIds[workspaceId] = null;
		}
	}

	return {
		tabs: finalTabs,
		activeTabIds: newActiveTabIds,
		tabHistoryStacks: {
			...state.tabHistoryStacks,
			[workspaceId]: newHistoryStack,
		},
	};
};

