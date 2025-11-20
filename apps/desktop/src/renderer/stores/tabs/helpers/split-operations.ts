import type { MosaicBranch, MosaicNode } from "react-mosaic-component";
import { updateTree } from "react-mosaic-component";
import type { Tab, TabsState } from "../types";
import { TabType } from "../types";
import { createNewTab } from "../utils";

export const handleSplitTabVertical = (
	state: TabsState,
	workspaceId: string,
	sourceTabId?: string,
	path?: MosaicBranch[],
): Partial<TabsState> => {
	const tabToSplit = sourceTabId
		? state.tabs.find((t) => t.id === sourceTabId)
		: state.tabs.find(
				(t) =>
					t.id === state.activeTabIds[workspaceId] && !t.parentId,
			);

	if (!tabToSplit || tabToSplit.type === TabType.Group) return {};

	// Groups can't be split - they already contain multiple panes
	if (tabToSplit.parentId && path) {
		return splitPaneInGroup(
			state,
			tabToSplit,
			workspaceId,
			path,
			"row",
		);
	}

	return convertTabToGroup(state, tabToSplit, workspaceId, "row");
};

export const handleSplitTabHorizontal = (
	state: TabsState,
	workspaceId: string,
	sourceTabId?: string,
	path?: MosaicBranch[],
): Partial<TabsState> => {
	const tabToSplit = sourceTabId
		? state.tabs.find((t) => t.id === sourceTabId)
		: state.tabs.find(
				(t) =>
					t.id === state.activeTabIds[workspaceId] && !t.parentId,
			);

	if (!tabToSplit || tabToSplit.type === TabType.Group) return {};

	// Groups can't be split - they already contain multiple panes
	if (tabToSplit.parentId && path) {
		return splitPaneInGroup(
			state,
			tabToSplit,
			workspaceId,
			path,
			"column",
		);
	}

	return convertTabToGroup(state, tabToSplit, workspaceId, "column");
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

	const newTab = createNewTab(workspaceId, TabType.Single);
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

	const newChildTab: Tab = {
		id: `tab-${Date.now() + 1}-${Math.random().toString(36).substring(2, 11)}`,
		title: "New Tab",
		workspaceId,
		type: TabType.Single,
		parentId: groupTab.id,
		isNew: true,
	};

	const updatedSourceTab: Tab = {
		...tabToSplit,
		parentId: groupTab.id,
	};

	const layout: MosaicNode<string> = {
		direction,
		first: tabToSplit.id,
		second: newChildTab.id,
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
		newChildTab,
	];

	return {
		tabs: newTabs,
		activeTabIds: {
			...state.activeTabIds,
			[workspaceId]: updatedGroupTab.id,
		},
	};
};

