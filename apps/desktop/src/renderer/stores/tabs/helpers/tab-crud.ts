import type { TabsState } from "../types";
import { TabType } from "../types";
import { createNewTab } from "../utils";

export const handleAddTab = (
	state: TabsState,
	workspaceId: string,
	type: TabType = TabType.Single,
): Partial<TabsState> => {
	const newTab = createNewTab(workspaceId, type);
	const currentActiveId = state.activeTabIds[workspaceId];
	const historyStack = state.tabHistoryStacks[workspaceId] || [];
	const newHistoryStack = currentActiveId
		? [currentActiveId, ...historyStack.filter((id) => id !== currentActiveId)]
		: historyStack;

	return {
		tabs: [...state.tabs, newTab],
		activeTabIds: {
			...state.activeTabIds,
			[workspaceId]: newTab.id,
		},
		tabHistoryStacks: {
			...state.tabHistoryStacks,
			[workspaceId]: newHistoryStack,
		},
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
	const workspaceTabs = state.tabs.filter(
		(tab) => tab.workspaceId === workspaceId && tab.id !== id,
	);
	const tabs = state.tabs.filter((tab) => tab.id !== id);

	const historyStack = state.tabHistoryStacks[workspaceId] || [];
	const newHistoryStack = historyStack.filter((tabId) => tabId !== id);

	const newActiveTabIds = { ...state.activeTabIds };
	if (state.activeTabIds[workspaceId] === id) {
		if (workspaceTabs.length > 0) {
			const nextTabFromHistory = newHistoryStack.find((tabId) =>
				workspaceTabs.some((tab) => tab.id === tabId),
			);
			if (nextTabFromHistory) {
				newActiveTabIds[workspaceId] = nextTabFromHistory;
			} else {
				const closedIndex = state.tabs
					.filter((tab) => tab.workspaceId === workspaceId)
					.findIndex((tab) => tab.id === id);
				const nextTab =
					workspaceTabs[closedIndex] || workspaceTabs[closedIndex - 1];
				newActiveTabIds[workspaceId] = nextTab.id;
			}
		} else {
			newActiveTabIds[workspaceId] = null;
		}
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
