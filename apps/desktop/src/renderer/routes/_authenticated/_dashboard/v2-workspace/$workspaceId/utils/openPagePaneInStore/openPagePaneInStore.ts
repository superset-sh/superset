import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PagePaneData, PaneViewerData } from "../../types";

function isSamePage(pane: PagePaneData, page: PagePaneData): boolean {
	if (pane.pageId && page.pageId) return pane.pageId === page.pageId;
	return pane.slug === page.slug;
}

export function openPagePaneInStore(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	page: PagePaneData,
): void {
	const state = store.getState();

	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "page") continue;
			if (!isSamePage(pane.data as PagePaneData, page)) continue;
			state.setActiveTab(tab.id);
			state.setActivePane({ tabId: tab.id, paneId: pane.id });
			return;
		}
	}

	state.addTab({ panes: [{ kind: "page", data: page as PaneViewerData }] });
}
