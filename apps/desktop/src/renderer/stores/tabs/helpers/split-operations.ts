import type { MosaicBranch, MosaicNode } from "react-mosaic-component";
import { updateTree } from "react-mosaic-component";
import type { Tab, TabsState } from "../types";
import { TabType } from "../types";
import { createNewTab } from "../utils";

/**
 * Find the path to a specific tab ID within a mosaic layout.
 * Returns the path array or null if not found.
 */
function findPathInLayout(
	layout: MosaicNode<string> | null,
	targetId: string,
	currentPath: MosaicBranch[] = [],
): MosaicBranch[] | null {
	if (!layout) return null;

	if (typeof layout === "string") {
		return layout === targetId ? currentPath : null;
	}

	const firstPath = findPathInLayout(layout.first, targetId, [
		...currentPath,
		"first",
	]);
	if (firstPath) return firstPath;

	const secondPath = findPathInLayout(layout.second, targetId, [
		...currentPath,
		"second",
	]);
	return secondPath;
}

/**
 * Find the first tab ID in a mosaic layout (leftmost/topmost leaf).
 */
function findFirstTabInLayout(
	layout: MosaicNode<string> | null,
): string | null {
	if (!layout) return null;
	if (typeof layout === "string") return layout;
	return findFirstTabInLayout(layout.first);
}

/**
 * Find a child tab to split when the active tab is a group.
 * Checks tab history first, then falls back to first tab in layout.
 */
function findChildTabToSplit(
	state: TabsState,
	group: Tab & { type: typeof TabType.Group },
	workspaceId: string,
): { tab: Tab; path: MosaicBranch[] } | null {
	if (!group.layout) return null;

	// Check history for a recently focused child of this group
	const history = state.tabHistoryStacks[workspaceId] || [];
	for (const historyTabId of history) {
		const historyTab = state.tabs.find((t) => t.id === historyTabId);
		if (historyTab && historyTab.parentId === group.id) {
			const path = findPathInLayout(group.layout, historyTab.id);
			if (path) return { tab: historyTab, path };
		}
	}

	// Fall back to first tab in the layout
	const firstTabId = findFirstTabInLayout(group.layout);
	if (!firstTabId) return null;

	const firstTab = state.tabs.find((t) => t.id === firstTabId);
	if (!firstTab) return null;

	const path = findPathInLayout(group.layout, firstTabId);
	if (!path) return null;

	return { tab: firstTab, path };
}

export const handleSplitTabVertical = (
	state: TabsState,
	workspaceId: string,
	sourceTabId?: string,
	path?: MosaicBranch[],
): Partial<TabsState> => {
	// When sourceTabId is provided, use it directly
	if (sourceTabId) {
		const tabToSplit = state.tabs.find((t) => t.id === sourceTabId);
		if (!tabToSplit || tabToSplit.type === TabType.Group) return {};

		if (tabToSplit.parentId && path) {
			return splitPaneInGroup(state, tabToSplit, workspaceId, path, "row");
		}
		return convertTabToGroup(state, tabToSplit, workspaceId, "row");
	}

	// Find the active tab (could be top-level, child, or group)
	const activeTabId = state.activeTabIds[workspaceId];
	const activeTab = state.tabs.find((t) => t.id === activeTabId);

	if (!activeTab) return {};

	// If active tab is a group, find a child tab to split
	if (activeTab.type === TabType.Group) {
		const childToSplit = findChildTabToSplit(state, activeTab, workspaceId);
		if (!childToSplit) return {};
		return splitPaneInGroup(
			state,
			childToSplit.tab,
			workspaceId,
			childToSplit.path,
			"row",
		);
	}

	// If the active tab is a child of a group, split within that group
	if (activeTab.parentId) {
		const parentGroup = state.tabs.find(
			(t) => t.id === activeTab.parentId && t.type === TabType.Group,
		);
		if (!parentGroup || parentGroup.type !== TabType.Group) return {};

		const foundPath = findPathInLayout(parentGroup.layout, activeTab.id);
		if (!foundPath) return {};

		return splitPaneInGroup(state, activeTab, workspaceId, foundPath, "row");
	}

	// Top-level single tab - convert to group
	return convertTabToGroup(state, activeTab, workspaceId, "row");
};

export const handleSplitTabHorizontal = (
	state: TabsState,
	workspaceId: string,
	sourceTabId?: string,
	path?: MosaicBranch[],
): Partial<TabsState> => {
	// When sourceTabId is provided, use it directly
	if (sourceTabId) {
		const tabToSplit = state.tabs.find((t) => t.id === sourceTabId);
		if (!tabToSplit || tabToSplit.type === TabType.Group) return {};

		if (tabToSplit.parentId && path) {
			return splitPaneInGroup(state, tabToSplit, workspaceId, path, "column");
		}
		return convertTabToGroup(state, tabToSplit, workspaceId, "column");
	}

	// Find the active tab (could be top-level, child, or group)
	const activeTabId = state.activeTabIds[workspaceId];
	const activeTab = state.tabs.find((t) => t.id === activeTabId);

	if (!activeTab) return {};

	// If active tab is a group, find a child tab to split
	if (activeTab.type === TabType.Group) {
		const childToSplit = findChildTabToSplit(state, activeTab, workspaceId);
		if (!childToSplit) return {};
		return splitPaneInGroup(
			state,
			childToSplit.tab,
			workspaceId,
			childToSplit.path,
			"column",
		);
	}

	// If the active tab is a child of a group, split within that group
	if (activeTab.parentId) {
		const parentGroup = state.tabs.find(
			(t) => t.id === activeTab.parentId && t.type === TabType.Group,
		);
		if (!parentGroup || parentGroup.type !== TabType.Group) return {};

		const foundPath = findPathInLayout(parentGroup.layout, activeTab.id);
		if (!foundPath) return {};

		return splitPaneInGroup(state, activeTab, workspaceId, foundPath, "column");
	}

	// Top-level single tab - convert to group
	return convertTabToGroup(state, activeTab, workspaceId, "column");
};

const splitPaneInGroup = (
	state: TabsState,
	tabToSplit: Tab,
	workspaceId: string,
	path: MosaicBranch[],
	direction: "row" | "column",
) => {
	const group = state.tabs.find(
		(t) => t.id === tabToSplit.parentId && t.type === TabType.Group,
	);
	if (!group || group.type !== TabType.Group || !group.layout) return state;

	const newTab = createNewTab(workspaceId, TabType.Single, state.tabs);
	const newTabWithParent: Tab = {
		...newTab,
		parentId: tabToSplit.parentId,
	};

	const newLayout = updateTree(group.layout, [
		{
			path,
			spec: {
				$set: {
					direction,
					first: tabToSplit.id,
					second: newTab.id,
					splitPercentage: 50,
				},
			},
		},
	]);

	const updatedTabs = state.tabs.map((tab) =>
		tab.id === group.id && tab.type === TabType.Group
			? { ...tab, layout: newLayout }
			: tab,
	);

	return {
		tabs: [...updatedTabs, newTabWithParent],
	};
};

const convertTabToGroup = (
	state: TabsState,
	tabToSplit: Tab,
	workspaceId: string,
	direction: "row" | "column",
) => {
	const groupTab: Tab = {
		id: `tab-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
		title: `${tabToSplit.title} - Split`,
		workspaceId,
		type: TabType.Group,
		layout: null,
		isNew: false,
	};

	const newChildTab = createNewTab(workspaceId, TabType.Single, state.tabs);
	const newChildTabWithParent: Tab = {
		...newChildTab,
		parentId: groupTab.id,
	};

	const updatedSourceTab: Tab = {
		...tabToSplit,
		parentId: groupTab.id,
	};

	const layout: MosaicNode<string> = {
		direction,
		first: tabToSplit.id,
		second: newChildTabWithParent.id,
		splitPercentage: 50,
	};

	const updatedGroupTab: Tab = {
		...groupTab,
		layout,
	};

	// Preserve tab order by inserting the group where the original tab was
	const workspaceTabs = state.tabs.filter(
		(t) => t.workspaceId === workspaceId && !t.parentId,
	);
	const sourceTabIndex = workspaceTabs.findIndex((t) => t.id === tabToSplit.id);

	const otherTabs = state.tabs.filter((t) => t.id !== tabToSplit.id);
	const otherWorkspaceTabs = otherTabs.filter(
		(t) => t.workspaceId === workspaceId && !t.parentId,
	);
	const nonWorkspaceTabs = otherTabs.filter(
		(t) => t.workspaceId !== workspaceId || t.parentId,
	);

	otherWorkspaceTabs.splice(sourceTabIndex, 0, updatedGroupTab);

	const newTabs = [
		...nonWorkspaceTabs,
		...otherWorkspaceTabs,
		updatedSourceTab,
		newChildTabWithParent,
	];

	return {
		tabs: newTabs,
		activeTabIds: {
			...state.activeTabIds,
			[workspaceId]: updatedGroupTab.id,
		},
	};
};
