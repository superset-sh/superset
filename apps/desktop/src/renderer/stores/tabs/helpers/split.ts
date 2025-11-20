import type { MosaicBranch, MosaicNode } from "react-mosaic-component";
import { updateTree } from "react-mosaic-component";
import type { Tab, TabsState } from "../types";
import { TabType } from "../types";
import { createNewTab } from "../utils";

/**
 * Splits a pane within an existing group
 */
export const splitPaneInGroup = (
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

	// Create a new child tab
	const newTab = createNewTab(workspaceId, TabType.Single);
	const newTabWithParent: Tab = {
		...newTab,
		parentId: tabToSplit.parentId,
	};

	// Update the mosaic layout
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

	// Update the group's layout and add the new tab
	const updatedTabs = state.tabs.map((tab) =>
		tab.id === group.id && tab.type === TabType.Group
			? { ...tab, layout: newLayout }
			: tab,
	);

	return {
		tabs: [...updatedTabs, newTabWithParent],
	};
};

/**
 * Converts a top-level tab into a group with a split
 */
export const convertTabToGroup = (
	state: TabsState,
	tabToSplit: Tab,
	workspaceId: string,
	direction: "row" | "column",
) => {
	// Create a new group tab
	const groupTab: Tab = {
		id: `tab-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
		title: `${tabToSplit.title} - Split`,
		workspaceId,
		type: TabType.Group,
		layout: null,
		isNew: false,
	};

	// Create a new child tab for the new pane
	const newChildTab: Tab = {
		id: `tab-${Date.now() + 1}-${Math.random().toString(36).substring(2, 11)}`,
		title: "New Tab",
		workspaceId,
		type: TabType.Single,
		parentId: groupTab.id,
		isNew: true,
	};

	// Update the original tab to be a child of the group
	const updatedSourceTab: Tab = {
		...tabToSplit,
		parentId: groupTab.id,
	};

	// Create the split layout
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

	// Find the position of the original tab
	const workspaceTabs = state.tabs.filter(
		(t) => t.workspaceId === workspaceId && !t.parentId,
	);
	const sourceTabIndex = workspaceTabs.findIndex((t) => t.id === tabToSplit.id);

	// Replace the source tab with the group and add the new child
	const otherTabs = state.tabs.filter((t) => t.id !== tabToSplit.id);
	const otherWorkspaceTabs = otherTabs.filter(
		(t) => t.workspaceId === workspaceId && !t.parentId,
	);
	const nonWorkspaceTabs = otherTabs.filter(
		(t) => t.workspaceId !== workspaceId || t.parentId,
	);

	// Insert the group at the original position
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
