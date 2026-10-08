import { transferTabToIndex, type WorkspaceStore } from "@superset/panes";
import { useEffect } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

const SIDEBAR_PANE_KINDS = new Set([
	"files",
	"changes-list",
	"diff",
	"review",
	"pages-list",
]);

export function useRightPaneAreaLifecycle({
	workspaceId,
	flag,
	centerStore,
	rightStore,
	isReady,
	hasRow,
}: {
	workspaceId: string;
	flag: boolean | undefined;
	centerStore: StoreApi<WorkspaceStore<PaneViewerData>>;
	rightStore: StoreApi<WorkspaceStore<PaneViewerData>>;
	isReady: boolean;
	hasRow: boolean;
}): void {
	const collections = useCollections();

	useEffect(() => {
		if (!isReady || !hasRow || flag !== false) return;
		if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
		const sessionTabs = rightStore
			.getState()
			.tabs.filter((tab) =>
				Object.values(tab.panes).some(
					(pane) => !SIDEBAR_PANE_KINDS.has(pane.kind),
				),
			);
		if (sessionTabs.length === 0) return;
		const centerActiveTabId = centerStore.getState().activeTabId;
		for (const tab of sessionTabs) {
			for (const pane of Object.values(tab.panes)) {
				if (!SIDEBAR_PANE_KINDS.has(pane.kind)) continue;
				rightStore
					.getState()
					.closePane({ tabId: tab.id, paneId: pane.id, intent: "remove" });
			}
			transferTabToIndex({
				source: rightStore,
				target: centerStore,
				tabId: tab.id,
			});
		}
		if (centerActiveTabId) {
			centerStore.getState().setActiveTab(centerActiveTabId);
		}
	}, [
		collections,
		workspaceId,
		flag,
		centerStore,
		rightStore,
		isReady,
		hasRow,
	]);
}
