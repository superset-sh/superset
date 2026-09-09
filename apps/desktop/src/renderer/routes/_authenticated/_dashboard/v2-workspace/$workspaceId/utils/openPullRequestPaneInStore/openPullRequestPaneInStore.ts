import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, PullRequestPaneData } from "../../types";

/**
 * Focus the workspace's pull-request pane, retargeting it to `prNumber`
 * when one already exists (a workspace links one PR, so one pane is
 * enough), or opening a fresh one beside the active pane — from the
 * Changes pane that lands the PR summary next to the diff.
 */
export function openPullRequestPaneInStore(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	prNumber: number,
): void {
	const state = store.getState();
	const data: PullRequestPaneData = { prNumber };

	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "pull-request") continue;
			if ((pane.data as PullRequestPaneData).prNumber !== prNumber) {
				state.setPaneData({ paneId: pane.id, data: data as PaneViewerData });
			}
			state.setActiveTab(tab.id);
			state.setActivePane({ tabId: tab.id, paneId: pane.id });
			return;
		}
	}

	state.openPane({
		pane: { kind: "pull-request", data: data as PaneViewerData },
	});
}
