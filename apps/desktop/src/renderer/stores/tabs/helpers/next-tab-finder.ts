import type { TabsState } from "../types";

/**
 * Finds the next best tab to activate when closing a tab.
 * Priority order (tries each until a tab is found):
 * 1. Most recently used tab from history stack
 * 2. Next sibling in the same group (for child tabs)
 * 3. Next/previous top-level tab by position
 * 4. Any remaining tab in the workspace
 */
export const findNextTab = (
	state: TabsState,
	tabIdToClose: string,
): string | null => {
	const tabToClose = state.tabs.find((tab) => tab.id === tabIdToClose);
	if (!tabToClose) return null;

	const workspaceId = tabToClose.workspaceId;
	const workspaceTabs = state.tabs.filter(
		(tab) => tab.workspaceId === workspaceId && tab.id !== tabIdToClose,
	);

	// Early exit if no tabs remain
	if (workspaceTabs.length === 0) return null;

	// Try each strategy in priority order
	let nextTabId: string | null = null;

	nextTabId = findNextFromHistory(state, workspaceId, tabIdToClose);
	if (nextTabId) return nextTabId;

	if (tabToClose.parentId) {
		nextTabId = findNextInGroup(state, tabIdToClose, tabToClose.parentId);
		if (nextTabId) return nextTabId;
	}

	nextTabId = findNextTopLevelTab(state, tabIdToClose, workspaceId);
	if (nextTabId) return nextTabId;

	// Ultimate fallback: return any available tab
	return workspaceTabs[0]?.id || null;
};

/**
 * Priority 1: Find next tab from history stack (most recently used)
 */
function findNextFromHistory(
	state: TabsState,
	workspaceId: string,
	tabIdToClose: string,
): string | null {
	const historyStack = state.tabHistoryStacks[workspaceId] || [];

	// Find the first tab in history that still exists and isn't being closed
	for (const historyTabId of historyStack) {
		if (historyTabId === tabIdToClose) continue;

		const historyTab = state.tabs.find((tab) => tab.id === historyTabId);
		if (historyTab && historyTab.workspaceId === workspaceId) {
			return historyTabId;
		}
	}

	return null;
}

/**
 * Priority 2: Find next sibling tab within the same group
 */
function findNextInGroup(
	state: TabsState,
	tabIdToClose: string,
	parentId: string,
): string | null {
	const siblings = state.tabs.filter((tab) => tab.parentId === parentId);
	const currentIndex = siblings.findIndex((tab) => tab.id === tabIdToClose);

	if (currentIndex === -1) return null;

	// Try next sibling, then previous sibling
	const nextIndex = currentIndex + 1;
	const prevIndex = currentIndex - 1;

	if (nextIndex < siblings.length) {
		return siblings[nextIndex].id;
	}

	if (prevIndex >= 0) {
		return siblings[prevIndex].id;
	}

	return null;
}

/**
 * Priority 3: Find next top-level tab by position
 * For child tabs, uses parent group's position
 */
function findNextTopLevelTab(
	state: TabsState,
	tabIdToClose: string,
	workspaceId: string,
): string | null {
	const tabToClose = state.tabs.find((tab) => tab.id === tabIdToClose);
	if (!tabToClose) return null;

	const topLevelTabs = state.tabs.filter(
		(tab) => tab.workspaceId === workspaceId && !tab.parentId,
	);

	// Determine which top-level tab/group to use as reference
	const referenceId = tabToClose.parentId || tabIdToClose;
	const currentIndex = topLevelTabs.findIndex((tab) => tab.id === referenceId);

	if (currentIndex === -1) return null;

	// Try next, then previous
	const nextIndex = currentIndex + 1;
	const prevIndex = currentIndex - 1;

	if (nextIndex < topLevelTabs.length) {
		return topLevelTabs[nextIndex].id;
	}

	if (prevIndex >= 0) {
		return topLevelTabs[prevIndex].id;
	}

	return null;
}
