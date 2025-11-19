import { type Tab, type TabGroup, TabType } from "./types";
import { createNewTab } from "./utils";

export interface DragTabToTabResult {
	tabs: Tab[];
	activeTabIds: Record<string, string | null>;
	tabHistoryStacks: Record<string, string[]>;
}

export const handleDragTabToTab = (
	draggedTabId: string,
	targetTabId: string,
	state: {
		tabs: Tab[];
		activeTabIds: Record<string, string | null>;
		tabHistoryStacks: Record<string, string[]>;
	},
): DragTabToTabResult => {
	const draggedTab = state.tabs.find((tab) => tab.id === draggedTabId);
	const targetTab = state.tabs.find((tab) => tab.id === targetTabId);

	if (!draggedTab || !targetTab) return state;

	const workspaceId = draggedTab.workspaceId;
	const historyStack = state.tabHistoryStacks[workspaceId] || [];

	// Rule 1: Dragging into itself - create new tab
	if (draggedTabId === targetTabId) {
		const newTab = createNewTab(workspaceId, TabType.Single);
		return {
			...state,
			tabs: [...state.tabs, newTab],
			activeTabIds: {
				...state.activeTabIds,
				[workspaceId]: newTab.id,
			},
		};
	}

	// Rule 2: Dragging into an existing group - join the group
	if (targetTab.type === TabType.Group && draggedTab.type === TabType.Single) {
		const newPaneId = `pane-${Date.now()}`;
		const updatedTargetTab: TabGroup = {
			...targetTab,
			panes: {
				...targetTab.panes,
				[newPaneId]: { title: draggedTab.title },
			},
			// Recompute layout - add new pane as split
			layout: {
				direction: "row",
				first: targetTab.layout,
				second: newPaneId,
				splitPercentage: 50,
			},
		};

		return {
			...state,
			tabs: state.tabs
				.map((tab) => (tab.id === targetTabId ? updatedTargetTab : tab))
				.filter((tab) => tab.id !== draggedTabId),
			activeTabIds: {
				...state.activeTabIds,
				[workspaceId]: targetTabId,
			},
			tabHistoryStacks: {
				...state.tabHistoryStacks,
				[workspaceId]: historyStack.filter((id) => id !== draggedTabId),
			},
		};
	}

	// Rule 3: Dragging into a different single tab - create new group
	if (targetTab.type === TabType.Single && draggedTab.type === TabType.Single) {
		const pane1 = `pane-${Date.now()}-1`;
		const pane2 = `pane-${Date.now()}-2`;

		const newGroupTab: TabGroup = {
			id: `tab-${Date.now()}-group`,
			title: `${targetTab.title} + ${draggedTab.title}`,
			workspaceId,
			type: TabType.Group,
			layout: {
				direction: "row",
				first: pane1,
				second: pane2,
				splitPercentage: 50,
			},
			panes: {
				[pane1]: { title: targetTab.title },
				[pane2]: { title: draggedTab.title },
			},
		};

		return {
			...state,
			tabs: [
				...state.tabs.filter(
					(tab) => tab.id !== targetTabId && tab.id !== draggedTabId,
				),
				newGroupTab,
			],
			activeTabIds: {
				...state.activeTabIds,
				[workspaceId]: newGroupTab.id,
			},
			tabHistoryStacks: {
				...state.tabHistoryStacks,
				[workspaceId]: historyStack.filter(
					(id) => id !== draggedTabId && id !== targetTabId,
				),
			},
		};
	}

	return state;
};
