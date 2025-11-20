import type { MosaicBranch } from "react-mosaic-component";
import type { TabsState } from "../types";
import { TabType } from "../types";
import { convertTabToGroup, splitPaneInGroup } from "./split";

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

