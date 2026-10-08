import type { CreatePaneInput, WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

export function openBesidePane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	anchorPaneId: string,
	pane: CreatePaneInput<PaneViewerData>,
	openInNewTab?: boolean,
): void {
	const state = store.getState();
	if (openInNewTab) {
		state.addTab({ panes: [pane] });
		return;
	}
	const location = state.getPane(anchorPaneId);
	const tab = location ? state.getTab(location.tabId) : null;
	if (!tab) {
		state.openPane({ pane });
		return;
	}
	const reusable = Object.values(tab.panes).find(
		(candidate) =>
			candidate.kind === pane.kind &&
			!candidate.pinned &&
			candidate.id !== anchorPaneId,
	);
	if (reusable) {
		state.setPaneData({ paneId: reusable.id, data: pane.data });
		state.setActivePane({ tabId: tab.id, paneId: reusable.id });
		return;
	}
	state.splitPane({
		tabId: tab.id,
		paneId: anchorPaneId,
		position: "left",
		newPane: pane,
	});
}
