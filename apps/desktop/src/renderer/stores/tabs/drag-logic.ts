import { type Tab, type TabGroup, TabType } from "./types";
import { createNewTab } from "./utils";

export interface DragTabToTabResult {
	tabs: Tab[];
	activeTabIds: Record<string, string | null>;
	tabHistoryStacks: Record<string, string[]>;
}

// Helper: Remove tab from its old parent group
const removeFromOldParent = (tabs: Tab[], tabId: string, oldParentId: string): Tab[] => {
	return tabs.map((tab) => {
		if (tab.id === oldParentId && tab.type === TabType.Group) {
			return {
				...tab,
				childTabIds: tab.childTabIds.filter((id) => id !== tabId),
			};
		}
		return tab;
	});
};

// Helper: Add tab to a new parent group
const addToParentGroup = (
	parentGroup: TabGroup,
	childTabId: string,
): TabGroup => {
	const newLayout =
		parentGroup.layout === null
			? childTabId
			: {
					direction: "row" as const,
					first: parentGroup.layout,
					second: childTabId,
					splitPercentage: 50,
				};

	return {
		...parentGroup,
		childTabIds: [...parentGroup.childTabIds, childTabId],
		layout: newLayout,
	};
};

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

	// Rule 1: Dragging tab into itself
	if (draggedTabId === targetTabId) {
		// If already a child tab, do nothing (can't create new tab from child)
		if (draggedTab.parentId) {
			return state;
		}
		// Create new tab for regular tabs
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

	// Rule 2: Dragging into a child tab (add to its parent group)
	if (targetTab.parentId && draggedTab.type === TabType.Single) {
		const parentGroup = state.tabs.find(
			(tab) => tab.id === targetTab.parentId && tab.type === TabType.Group,
		) as TabGroup | undefined;

		if (!parentGroup) return state;

		// Already a child of this group - do nothing
		if (draggedTab.parentId === parentGroup.id) {
			return state;
		}

		// Update dragged tab's parent
		const updatedDraggedTab: Tab = {
			...draggedTab,
			parentId: parentGroup.id,
		};

		// Add to parent group
		const updatedParentGroup = addToParentGroup(parentGroup, draggedTabId);

		// Remove from old parent if needed
		let updatedTabs = state.tabs.map((tab) => {
			if (tab.id === parentGroup.id) return updatedParentGroup;
			if (tab.id === draggedTabId) return updatedDraggedTab;
			return tab;
		});

		if (draggedTab.parentId) {
			updatedTabs = removeFromOldParent(
				updatedTabs,
				draggedTabId,
				draggedTab.parentId,
			);
		}

		return {
			...state,
			tabs: updatedTabs,
			activeTabIds: {
				...state.activeTabIds,
				[workspaceId]: parentGroup.id,
			},
			tabHistoryStacks: {
				...state.tabHistoryStacks,
				[workspaceId]: historyStack.filter((id) => id !== draggedTabId),
			},
		};
	}

	// Rule 3: Dragging into a group tab directly
	if (targetTab.type === TabType.Group && draggedTab.type === TabType.Single) {
		// Already a child of this group - do nothing
		if (draggedTab.parentId === targetTabId) {
			return state;
		}

		// Update dragged tab's parent
		const updatedDraggedTab: Tab = {
			...draggedTab,
			parentId: targetTabId,
		};

		// Add to target group
		const updatedTargetTab = addToParentGroup(targetTab, draggedTabId);

		// Remove from old parent if needed
		let updatedTabs = state.tabs.map((tab) => {
			if (tab.id === targetTabId) return updatedTargetTab;
			if (tab.id === draggedTabId) return updatedDraggedTab;
			return tab;
		});

		if (draggedTab.parentId) {
			updatedTabs = removeFromOldParent(
				updatedTabs,
				draggedTabId,
				draggedTab.parentId,
			);
		}

		return {
			...state,
			tabs: updatedTabs,
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

	// Rule 4: Dragging single tab into another single tab (create new group)
	if (targetTab.type === TabType.Single && draggedTab.type === TabType.Single) {
		const groupId = `tab-${Date.now()}-group`;
		const childTab1Id = `tab-${Date.now()}-child-1`;
		const childTab2Id = `tab-${Date.now()}-child-2`;

		// Create child tabs from originals
		const childTab1: Tab = {
			...targetTab,
			id: childTab1Id,
			parentId: groupId,
		};

		const childTab2: Tab = {
			...draggedTab,
			id: childTab2Id,
			parentId: groupId,
		};

		const newGroupTab: TabGroup = {
			id: groupId,
			title: `${targetTab.title} + ${draggedTab.title}`,
			workspaceId,
			type: TabType.Group,
			layout: {
				direction: "row",
				first: childTab1Id,
				second: childTab2Id,
				splitPercentage: 50,
			},
			childTabIds: [childTab1Id, childTab2Id],
		};

		return {
			...state,
			tabs: [
				...state.tabs.filter(
					(tab) => tab.id !== targetTabId && tab.id !== draggedTabId,
				),
				childTab1,
				childTab2,
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
