import type { Tab, TabsState } from "../types";

/**
 * Sets the active tab for a workspace and updates history
 */
export const handleSetActiveTab = (
	state: TabsState,
	workspaceId: string,
	tabId: string,
): Partial<TabsState> => {
	const currentActiveId = state.activeTabIds[workspaceId];
	const historyStack = state.tabHistoryStacks[workspaceId] || [];

	let newHistoryStack = historyStack.filter((id) => id !== tabId);
	if (currentActiveId && currentActiveId !== tabId) {
		newHistoryStack = [
			currentActiveId,
			...newHistoryStack.filter((id) => id !== currentActiveId),
		];
	}

	return {
		activeTabIds: {
			...state.activeTabIds,
			[workspaceId]: tabId,
		},
		tabHistoryStacks: {
			...state.tabHistoryStacks,
			[workspaceId]: newHistoryStack,
		},
	};
};

/**
 * Gets tabs filtered by workspace
 */
export const getTabsByWorkspace = (
	state: TabsState,
	workspaceId: string,
): Tab[] => {
	return state.tabs.filter((tab) => tab.workspaceId === workspaceId);
};

/**
 * Gets the currently active tab for a workspace
 */
export const getActiveTab = (
	state: TabsState,
	workspaceId: string,
): Tab | null => {
	const activeTabId = state.activeTabIds[workspaceId];
	if (!activeTabId) return null;
	return state.tabs.find((tab) => tab.id === activeTabId) || null;
};

/**
 * Gets the last active tab ID from history
 */
export const getLastActiveTabId = (
	state: TabsState,
	workspaceId: string,
): string | null => {
	const historyStack = state.tabHistoryStacks[workspaceId] || [];
	return historyStack[0] || null;
};

