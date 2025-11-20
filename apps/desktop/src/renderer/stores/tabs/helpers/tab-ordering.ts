import type { TabsState } from "../types";

/**
 * Reorders tabs within a workspace by index
 */
export const handleReorderTabs = (
	state: TabsState,
	workspaceId: string,
	startIndex: number,
	endIndex: number,
): Partial<TabsState> => {
	const workspaceTabs = state.tabs.filter(
		(tab) => tab.workspaceId === workspaceId,
	);
	const otherTabs = state.tabs.filter(
		(tab) => tab.workspaceId !== workspaceId,
	);

	const [removed] = workspaceTabs.splice(startIndex, 1);
	workspaceTabs.splice(endIndex, 0, removed);

	return { tabs: [...otherTabs, ...workspaceTabs] };
};

/**
 * Reorders a tab by ID to a target index
 */
export const handleReorderTabById = (
	state: TabsState,
	tabId: string,
	targetIndex: number,
): Partial<TabsState> => {
	const tab = state.tabs.find((t) => t.id === tabId);
	if (!tab || tab.parentId) return {}; // Only reorder top-level tabs

	const workspaceId = tab.workspaceId;
	const workspaceTabs = state.tabs.filter(
		(t) => t.workspaceId === workspaceId && !t.parentId,
	);
	const otherTabs = state.tabs.filter(
		(t) => t.workspaceId !== workspaceId || t.parentId,
	);

	const tabToMove = workspaceTabs.find((t) => t.id === tabId);
	if (!tabToMove) return {};

	const filteredTabs = workspaceTabs.filter((t) => t.id !== tabId);
	filteredTabs.splice(targetIndex, 0, tabToMove);

	return { tabs: [...otherTabs, ...filteredTabs] };
};

