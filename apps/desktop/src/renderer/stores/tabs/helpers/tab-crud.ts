import type { TabsState } from "../types";
import { TabType } from "../types";
import { type CreateTabOptions, createNewTab } from "../utils";
import { findNextTab } from "./next-tab-finder";

export const handleAddTab = (
	state: TabsState,
	workspaceId: string,
	type: TabType = TabType.Single,
	options?: CreateTabOptions,
): { newState: Partial<TabsState>; tabId: string } => {
	const newTab = createNewTab(workspaceId, type, state.tabs, options);
	const currentActiveId = state.activeTabIds[workspaceId];
	const historyStack = state.tabHistoryStacks[workspaceId] || [];
	const newHistoryStack = currentActiveId
		? [currentActiveId, ...historyStack.filter((id) => id !== currentActiveId)]
		: historyStack;

	return {
		newState: {
			tabs: [newTab, ...state.tabs],
			activeTabIds: {
				...state.activeTabIds,
				[workspaceId]: newTab.id,
			},
			tabHistoryStacks: {
				...state.tabHistoryStacks,
				[workspaceId]: newHistoryStack,
			},
		},
		tabId: newTab.id,
	};
};

/**
 * Removes a tab from state
 * Returns null if the operation should be delegated or prevented
 */
export const handleRemoveTab = (
	state: TabsState,
	id: string,
): Partial<TabsState> | null => {
	const tabToRemove = state.tabs.find((tab) => tab.id === id);
	if (!tabToRemove) return null;

	// Group tabs must be ungrouped first to prevent orphaned layouts
	if (tabToRemove.type === TabType.Group) {
		console.error("Cannot close group tabs directly. Ungroup the tabs first.");
		return null;
	}

	// Child tabs require group cleanup, so delegate to removeChildTabFromGroup
	if (tabToRemove.parentId) {
		return null;
	}

	const workspaceId = tabToRemove.workspaceId;
	const tabs = state.tabs.filter((tab) => tab.id !== id);

	const historyStack = state.tabHistoryStacks[workspaceId] || [];
	const newHistoryStack = historyStack.filter((tabId) => tabId !== id);

	const newActiveTabIds = { ...state.activeTabIds };
	if (state.activeTabIds[workspaceId] === id) {
		const nextTabId = findNextTab(state, id);
		newActiveTabIds[workspaceId] = nextTabId;
	}

	return {
		tabs,
		activeTabIds: newActiveTabIds,
		tabHistoryStacks: {
			...state.tabHistoryStacks,
			[workspaceId]: newHistoryStack,
		},
	};
};

export const handleRenameTab = (
	state: TabsState,
	id: string,
	newTitle: string,
): Partial<TabsState> => {
	return {
		tabs: state.tabs.map((tab) =>
			tab.id === id ? { ...tab, title: newTitle } : tab,
		),
	};
};

export const handleMarkTabAsUsed = (
	state: TabsState,
	id: string,
): Partial<TabsState> => {
	return {
		tabs: state.tabs.map((tab) =>
			tab.id === id ? { ...tab, isNew: false } : tab,
		),
	};
};
