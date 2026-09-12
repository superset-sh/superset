import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PagePaneData, PaneViewerData } from "../../types";
import { focusOrOpenPane } from "../focusOrOpenPane";

function isSamePage(pane: PagePaneData, page: PagePaneData): boolean {
	if (pane.pageId && page.pageId) return pane.pageId === page.pageId;
	return pane.slug === page.slug;
}

export function openPagePaneInStore(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	page: PagePaneData,
	placement: "split" | "tab" = "split",
): void {
	focusOrOpenPane<PagePaneData>(
		store,
		"page",
		(pane) => isSamePage(pane, page),
		page,
		placement,
	);
}
