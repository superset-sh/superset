import type { CreatePaneInput, WorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/types";
import type { StoreApi } from "zustand/vanilla";

export function replaceBrowserPane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	tabId: string,
	paneId: string,
	newPane: CreatePaneInput<PaneViewerData>,
) {
	const state = store.getState();
	const pane = state.tabs.find((tab) => tab.id === tabId)?.panes[paneId];
	if (!pane || pane.kind !== "browser") return;
	if (pane.pinned) state.setPanePinned({ paneId, pinned: false });
	state.replacePane({
		tabId,
		paneId,
		newPane: { ...newPane, pinned: pane.pinned },
	});
}
