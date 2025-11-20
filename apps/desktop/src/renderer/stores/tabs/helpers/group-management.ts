import type { TabsState } from "../types";

/**
 * Handles the logic for when an empty group needs to be removed
 * Returns updated state with the group removed and active tab/history updated
 */
export const handleEmptyGroupRemoval = (
	tabs: Tab[],
	activeTabIds: Record<string, string | null>,
	tabHistoryStacks: Record<string, string[]>,
	workspaceId: string,
	idsToRemove: string[],
	fallbackActiveTabId?: string,
): TabsState => {
	const remainingTabs = tabs.filter((tab) => !idsToRemove.includes(tab.id));
	const currentActiveId = activeTabIds[workspaceId];
	const historyStack = tabHistoryStacks[workspaceId] || [];

	const newActiveTabIds = { ...activeTabIds };
	const newHistoryStack = historyStack.filter(
		(id) => !idsToRemove.includes(id),
	);

	// Update active tab if needed
	if (idsToRemove.includes(currentActiveId || "")) {
		const workspaceTabs = remainingTabs.filter(
			(tab) => tab.workspaceId === workspaceId,
		);

		if (workspaceTabs.length > 0) {
			// Try to use fallback (e.g., the ungrouped tab), then history, then first available
			if (
				fallbackActiveTabId &&
				remainingTabs.some((t) => t.id === fallbackActiveTabId)
			) {
				newActiveTabIds[workspaceId] = fallbackActiveTabId;
			} else {
				const nextTabFromHistory = newHistoryStack.find((tabId) =>
					workspaceTabs.some((tab) => tab.id === tabId),
				);
				newActiveTabIds[workspaceId] =
					nextTabFromHistory || workspaceTabs[0].id;
			}
		} else {
			newActiveTabIds[workspaceId] = null;
		}
	}

	return {
		tabs: remainingTabs,
		activeTabIds: newActiveTabIds,
		tabHistoryStacks: {
			...tabHistoryStacks,
			[workspaceId]: newHistoryStack,
		},
	};
};

