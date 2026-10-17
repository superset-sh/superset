import { transferPaneToNewTab, type WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import { isSessionPaneKind } from "../isSessionPaneKind";

type Store = StoreApi<WorkspaceStore<PaneViewerData>>;

export function moveViewerPanesToRight({
	center,
	right,
}: {
	center: Store;
	right: Store;
}): void {
	for (const tab of center.getState().tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (isSessionPaneKind(pane.kind)) continue;
			transferPaneToNewTab({ source: center, target: right, paneId: pane.id });
		}
	}
}
