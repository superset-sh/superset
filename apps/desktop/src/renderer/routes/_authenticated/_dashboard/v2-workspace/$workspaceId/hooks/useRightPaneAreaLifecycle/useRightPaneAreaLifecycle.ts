import { transferTabToIndex, type WorkspaceStore } from "@superset/panes";
import { useEffect } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { StoreApi } from "zustand/vanilla";
import type { DiffPaneData, PaneViewerData } from "../../types";

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
		if (!isReady || !hasRow || flag === undefined) return;
		const row = collections.v2WorkspaceLocalState.get(workspaceId);
		if (!row) return;
		if (flag === false) {
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
			return;
		}
		if (row.rightPaneLayout !== undefined) return;
		const state = rightStore.getState();
		state.addTab({ panes: [{ kind: "files", data: { kind: "files" } }] });
		state.addTab({
			panes: [
				{
					kind: "diff",
					data: { path: "", collapsedFiles: [] } as DiffPaneData,
				},
			],
		});
		const [first] = rightStore.getState().tabs;
		if (first) rightStore.getState().setActiveTab(first.id);
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
