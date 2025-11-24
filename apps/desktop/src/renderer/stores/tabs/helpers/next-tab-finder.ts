import type { TabsState } from "../types";

/**
 * Finds the next best tab to activate when closing a tab.
 * Priority (only move to next if previous couldn't be found):
 * 1. From history stack
 * 2. Next tab in the same group (front then back)
 * 3. Next tab outside of group (front then back)
 * 4. Any remaining tab in the workspace (ultimate fallback)
 */
export const findNextTab = (
	state: TabsState,
	tabIdToClose: string,
): string | null => {
	const tabToClose = state.tabs.find((tab) => tab.id === tabIdToClose);
	if (!tabToClose) return null;

	const workspaceId = tabToClose.workspaceId;

	// Get all tabs in workspace (excluding the one being closed)
	const allWorkspaceTabs = state.tabs.filter(
		(tab) => tab.workspaceId === workspaceId && tab.id !== tabIdToClose,
	);

	// If no tabs remain in workspace, return null
	if (allWorkspaceTabs.length === 0) return null;

	// Priority 1: Try history stack first
	const nextFromHistory = findNextFromHistory(state, tabIdToClose, workspaceId);
	if (nextFromHistory) return nextFromHistory;

	// Priority 2: If closing a child tab, try siblings in the same group
	if (tabToClose.parentId) {
		const nextInGroup = findNextInGroup(
			state,
			tabIdToClose,
			tabToClose.parentId,
		);
		if (nextInGroup) return nextInGroup;
	}

	// Priority 3: Try top-level tabs (by position)
	const nextTopLevel = findNextTopLevelTab(state, tabIdToClose, workspaceId);
	if (nextTopLevel) return nextTopLevel;

	// Ultimate fallback: return any available tab in the workspace
	return ultimateFallback(state, workspaceId, tabIdToClose);
};

/**
 * Priority 1: Find next tab from history stack
 */
function findNextFromHistory(
	state: TabsState,
	tabIdToClose: string,
	workspaceId: string,
): string | null {
	const historyStack = state.tabHistoryStacks[workspaceId] || [];
	const newHistoryStack = historyStack.filter((id) => id !== tabIdToClose);

	if (newHistoryStack.length === 0) return null;

	// Find the first tab in history that still exists
	for (const historyTabId of newHistoryStack) {
		const historyTab = state.tabs.find((tab) => tab.id === historyTabId);
		if (historyTab && historyTab.workspaceId === workspaceId) {
			return historyTabId;
		}
	}

	return null;
}

/**
 * Priority 2: Find next tab within the same group
 */
function findNextInGroup(
	state: TabsState,
	tabIdToClose: string,
	parentId: string,
): string | null {
	const siblingsInGroup = state.tabs.filter(
		(tab) => tab.parentId === parentId && tab.id !== tabIdToClose,
	);

	if (siblingsInGroup.length === 0) return null;

	// Get all tabs in the group ordered by their appearance in state.tabs
	const orderedSiblings = state.tabs.filter((tab) => tab.parentId === parentId);
	const currentIndex = orderedSiblings.findIndex(
		(tab) => tab.id === tabIdToClose,
	);

	// Try next tab in group (front)
	if (currentIndex < orderedSiblings.length - 1) {
		return orderedSiblings[currentIndex + 1].id;
	}

	// Then try previous tab in group (back)
	if (currentIndex > 0) {
		return orderedSiblings[currentIndex - 1].id;
	}

	return null;
}

/**
 * Priority 3: Find next top-level tab by position
 */
function findNextTopLevelTab(
	state: TabsState,
	tabIdToClose: string,
	workspaceId: string,
): string | null {
	const tabToClose = state.tabs.find((tab) => tab.id === tabIdToClose);
	if (!tabToClose) return null;

	const workspaceTabs = state.tabs.filter(
		(tab) => tab.workspaceId === workspaceId && !tab.parentId,
	);

	const currentIndex = workspaceTabs.findIndex(
		(tab) => tab.id === tabIdToClose,
	);

	// For tabs in a group, find where the parent group is
	if (tabToClose.parentId && currentIndex === -1) {
		return findNextRelativeToParentGroup(
			state,
			tabToClose.parentId,
			workspaceTabs,
		);
	}

	// For top-level tabs, find by position
	if (currentIndex !== -1) {
		// Try next tab (front)
		if (currentIndex < workspaceTabs.length - 1) {
			return workspaceTabs[currentIndex + 1]?.id || null;
		}

		// Then try previous tab (back)
		if (currentIndex > 0) {
			return workspaceTabs[currentIndex - 1]?.id || null;
		}
	}

	return null;
}

/**
 * Helper: Find next tab relative to parent group position
 */
function findNextRelativeToParentGroup(
	state: TabsState,
	parentId: string,
	workspaceTabs: typeof state.tabs,
): string | null {
	const parentGroup = state.tabs.find((tab) => tab.id === parentId);
	if (!parentGroup) return null;

	const parentIndex = workspaceTabs.findIndex(
		(tab) => tab.id === parentGroup.id,
	);
	if (parentIndex === -1) return null;

	// Try next tab after parent group (front)
	if (parentIndex < workspaceTabs.length - 1) {
		return workspaceTabs[parentIndex + 1]?.id || null;
	}

	// Then try previous tab before parent group (back)
	if (parentIndex > 0) {
		return workspaceTabs[parentIndex - 1]?.id || null;
	}

	return null;
}

/**
 * Ultimate fallback: Return any available tab in the workspace
 */
function ultimateFallback(
	state: TabsState,
	workspaceId: string,
	tabIdToClose: string,
): string | null {
	const topLevelTabs = state.tabs.filter(
		(tab) =>
			tab.workspaceId === workspaceId &&
			!tab.parentId &&
			tab.id !== tabIdToClose,
	);

	// Prefer top-level tabs first
	if (topLevelTabs.length > 0) {
		return topLevelTabs[0].id;
	}

	// If no top-level tabs, return any child tab in the workspace
	const allWorkspaceTabs = state.tabs.filter(
		(tab) => tab.workspaceId === workspaceId && tab.id !== tabIdToClose,
	);

	return allWorkspaceTabs[0]?.id || null;
}
