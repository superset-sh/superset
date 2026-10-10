import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

export function openUrlInRightPane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	url: string,
): void {
	const state = store.getState();
	const newPane = { kind: "browser", data: { url } };
	const activeTab = state.getActiveTab();
	const browser =
		activeTab &&
		Object.values(activeTab.panes).find(
			(pane) => pane.kind === "browser" && !pane.pinned,
		);
	if (activeTab && browser) {
		state.replacePane({ tabId: activeTab.id, paneId: browser.id, newPane });
		return;
	}
	state.addTab({ panes: [newPane] });
}
