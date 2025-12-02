import type { Tab, TabsState } from "../types";

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

	// Clear needsAttention for the tab being activated
	const updatedTabs = state.tabs.map((tab) =>
		tab.id === tabId && tab.needsAttention
			? { ...tab, needsAttention: false }
			: tab,
	);

	return {
		activeTabIds: {
			...state.activeTabIds,
			[workspaceId]: tabId,
		},
		tabHistoryStacks: {
			...state.tabHistoryStacks,
			[workspaceId]: newHistoryStack,
		},
		tabs: updatedTabs,
	};
};

export const getTabsByWorkspace = (
	state: TabsState,
	workspaceId: string,
): Tab[] => {
	return state.tabs.filter((tab) => tab.workspaceId === workspaceId);
};

export const getActiveTab = (
	state: TabsState,
	workspaceId: string,
): Tab | null => {
	const activeTabId = state.activeTabIds[workspaceId];
	if (!activeTabId) return null;
	return state.tabs.find((tab) => tab.id === activeTabId) || null;
};

export const getLastActiveTabId = (
	state: TabsState,
	workspaceId: string,
): string | null => {
	const historyStack = state.tabHistoryStacks[workspaceId] || [];
	return historyStack[0] || null;
};
