import type { MosaicBranch } from "react-mosaic-component";
import type { TabsState } from "../types";
import { TabType } from "../types";
import { convertTabToGroup, splitPaneInGroup } from "./split";

/**
 * Handles vertical split operation
 */
export const handleSplitTabVertical = (
	state: TabsState,
	workspaceId: string,
	sourceTabId?: string,
	path?: MosaicBranch[],
): Partial<TabsState> => {
	// Use provided sourceTabId or get the active tab
	const tabToSplit = sourceTabId
		? state.tabs.find((t) => t.id === sourceTabId)
		: state.tabs.find(
				(t) =>
					t.id === state.activeTabIds[workspaceId] && !t.parentId,
			);

	if (!tabToSplit || tabToSplit.type === TabType.Group) return {};

	// Check if this tab is within a group (has a parentId) and path is provided
	if (tabToSplit.parentId && path) {
		return splitPaneInGroup(
			state,
			tabToSplit,
			workspaceId,
			path,
			"row",
		);
	}

	// Convert top-level tab into a group
	return convertTabToGroup(state, tabToSplit, workspaceId, "row");
};

/**
 * Handles horizontal split operation
 */
export const handleSplitTabHorizontal = (
	state: TabsState,
	workspaceId: string,
	sourceTabId?: string,
	path?: MosaicBranch[],
): Partial<TabsState> => {
	// Use provided sourceTabId or get the active tab
	const tabToSplit = sourceTabId
		? state.tabs.find((t) => t.id === sourceTabId)
		: state.tabs.find(
				(t) =>
					t.id === state.activeTabIds[workspaceId] && !t.parentId,
			);

	if (!tabToSplit || tabToSplit.type === TabType.Group) return {};

	// Check if this tab is within a group (has a parentId) and path is provided
	if (tabToSplit.parentId && path) {
		return splitPaneInGroup(
			state,
			tabToSplit,
			workspaceId,
			path,
			"column",
		);
	}

	// Convert top-level tab into a group
	return convertTabToGroup(state, tabToSplit, workspaceId, "column");
};

