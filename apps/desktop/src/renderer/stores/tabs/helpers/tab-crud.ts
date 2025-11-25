import type { TabsState } from "../types";
import { TabType } from "../types";
import { createNewTab } from "../utils";
import { findNextTab } from "./next-tab-finder";

export const handleAddTab = (
	state: TabsState,
	workspaceId: string,
	type: TabType = TabType.Single,
): Partial<TabsState> => {
	const newTab = createNewTab(workspaceId, type, state.tabs);
	const currentActiveId = state.activeTabIds[workspaceId];
	const historyStack = state.tabHistoryStacks[workspaceId] || [];
	const newHistoryStack = currentActiveId
		? [currentActiveId, ...historyStack.filter((id) => id !== currentActiveId)]
		: historyStack;

	return {
		tabs: [newTab, ...state.tabs],
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

export const handleAddSetupTab = (
	state: TabsState,
	workspaceId: string,
	setupCommands: string[],
	setupCwd: string,
	setupCopyResults?: { copied: string[]; errors: string[] },
): Partial<TabsState> => {
	const baseTab = createNewTab(workspaceId, TabType.Setup, state.tabs);
	const setupTab = {
		...baseTab,
		type: TabType.Setup as const,
		title: "Setup Worktree",
		setupCommands,
		setupCwd,
		setupCopyResults,
	};

	const currentActiveId = state.activeTabIds[workspaceId];
	const historyStack = state.tabHistoryStacks[workspaceId] || [];
	const newHistoryStack = currentActiveId
		? [currentActiveId, ...historyStack.filter((id) => id !== currentActiveId)]
		: historyStack;

	return {
		tabs: [setupTab, ...state.tabs],
		activeTabIds: {
			...state.activeTabIds,
			[workspaceId]: setupTab.id,
		},
		tabHistoryStacks: {
			...state.tabHistoryStacks,
			[workspaceId]: newHistoryStack,
		},
	};
};
