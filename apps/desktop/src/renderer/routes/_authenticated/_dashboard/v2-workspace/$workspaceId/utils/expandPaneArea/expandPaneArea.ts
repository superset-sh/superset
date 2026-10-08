import { transferTabToIndex, type WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

type Store = StoreApi<WorkspaceStore<PaneViewerData>>;

export interface ExpandedPaneAreaSnapshot {
	movedTabIds: string[];
	centerActiveTabId: string | null;
	rightActiveTabId: string | null;
}

export function expandPaneArea({
	center,
	right,
}: {
	center: Store;
	right: Store;
}): ExpandedPaneAreaSnapshot {
	const { tabs, activeTabId: centerActiveTabId } = center.getState();
	const rightActiveTabId = right.getState().activeTabId;
	const movedTabIds = tabs.map((tab) => tab.id);
	movedTabIds.forEach((tabId, index) => {
		transferTabToIndex({
			source: center,
			target: right,
			tabId,
			toIndex: index,
		});
	});
	const activeTabId = rightActiveTabId ?? centerActiveTabId;
	if (activeTabId) right.getState().setActiveTab(activeTabId);
	return { movedTabIds, centerActiveTabId, rightActiveTabId };
}

export function restorePaneArea({
	center,
	right,
	snapshot,
}: {
	center: Store;
	right: Store;
	snapshot: ExpandedPaneAreaSnapshot;
}): void {
	for (const tabId of snapshot.movedTabIds) {
		transferTabToIndex({ source: right, target: center, tabId });
	}
	if (snapshot.centerActiveTabId) {
		center.getState().setActiveTab(snapshot.centerActiveTabId);
	}
	if (snapshot.rightActiveTabId) {
		right.getState().setActiveTab(snapshot.rightActiveTabId);
	}
}
