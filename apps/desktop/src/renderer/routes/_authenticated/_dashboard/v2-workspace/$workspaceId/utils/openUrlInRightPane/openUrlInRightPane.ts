import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

export function openUrlInRightPane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	url: string,
): void {
	const state = store.getState();
	const newPane = { kind: "browser", data: { url } };
	for (const tab of state.tabs) {
		const browser = Object.values(tab.panes).find(
			(pane) => pane.kind === "browser" && !pane.pinned,
		);
		if (!browser) continue;
		state.setActiveTab(tab.id);
		state.replacePane({ tabId: tab.id, paneId: browser.id, newPane });
		return;
	}
	state.addTab({ panes: [newPane] });
}
