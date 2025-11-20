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
	const historyStack = state.tabHistoryStacks[workspaceId] || [];

	// Get all tabs in workspace (excluding the one being closed)
	const allWorkspaceTabs = state.tabs.filter(
		(tab) => tab.workspaceId === workspaceId && tab.id !== tabIdToClose,
	);

	// If no tabs remain in workspace, return null
	if (allWorkspaceTabs.length === 0) return null;

	// Priority 1: Try to find a tab from history stack (excluding the tab being closed)
	const newHistoryStack = historyStack.filter((id) => id !== tabIdToClose);
	if (newHistoryStack.length > 0) {
		// Find the first tab in history that still exists
		for (const historyTabId of newHistoryStack) {
			const historyTab = state.tabs.find((tab) => tab.id === historyTabId);
			if (historyTab && historyTab.workspaceId === workspaceId) {
				return historyTabId;
			}
		}
	}

	// Priority 2: If tab is in a group, try to find next tab in the same group
	if (tabToClose.parentId) {
		const siblingsInGroup = state.tabs.filter(
			(tab) => tab.parentId === tabToClose.parentId && tab.id !== tabIdToClose,
		);

		if (siblingsInGroup.length > 0) {
			// Get all tabs in the group ordered by their appearance in state.tabs
			const orderedSiblings = state.tabs.filter(
				(tab) => tab.parentId === tabToClose.parentId,
			);
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
		}
	}

	// Priority 3: Find next tab outside of group (top-level tabs in workspace)
	const workspaceTabs = state.tabs.filter(
		(tab) => tab.workspaceId === workspaceId && !tab.parentId,
	);

	const currentIndex = workspaceTabs.findIndex(
		(tab) => tab.id === tabIdToClose,
	);

	// Filter out the tab we're closing
	const remainingTopLevelTabs = workspaceTabs.filter(
		(tab) => tab.id !== tabIdToClose,
	);

	// For tabs in a group, we need to find where the parent group is
	if (tabToClose.parentId && currentIndex === -1) {
		if (remainingTopLevelTabs.length > 0) {
			const parentGroup = state.tabs.find(
				(tab) => tab.id === tabToClose.parentId,
			);
			if (parentGroup) {
				const parentIndex = workspaceTabs.findIndex(
					(tab) => tab.id === parentGroup.id,
				);
				if (parentIndex !== -1) {
					// Try next tab after parent group (front)
					if (parentIndex < workspaceTabs.length - 1) {
						return workspaceTabs[parentIndex + 1]?.id || null;
					}
					// Then try previous tab before parent group (back)
					if (parentIndex > 0) {
						return workspaceTabs[parentIndex - 1]?.id || null;
					}
				}
			}
		}
	}

	// For top-level tabs
	if (currentIndex !== -1 && remainingTopLevelTabs.length > 0) {
		// Try next tab (front)
		if (currentIndex < workspaceTabs.length - 1) {
			const nextTab = remainingTopLevelTabs[currentIndex];
			if (nextTab) return nextTab.id;
		}
		// Then try previous tab (back)
		if (currentIndex > 0) {
			const prevTab = remainingTopLevelTabs[currentIndex - 1];
			if (prevTab) return prevTab.id;
		}
	}

	// Ultimate fallback: return any available tab in the workspace
	// Prefer top-level tabs first, then any child tab
	if (remainingTopLevelTabs.length > 0) {
		return remainingTopLevelTabs[0].id;
	}

	// If no top-level tabs, return any child tab
	return allWorkspaceTabs[0]?.id || null;
};
