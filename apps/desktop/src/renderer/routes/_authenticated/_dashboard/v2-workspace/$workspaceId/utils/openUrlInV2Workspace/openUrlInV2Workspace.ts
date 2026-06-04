import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { BrowserPaneData, PaneViewerData } from "../../types";

export type V2WorkspaceUrlOpenTarget = "current-tab" | "new-tab";

export function openUrlInV2Workspace({
	store,
	target,
	url,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	target: V2WorkspaceUrlOpenTarget;
	url: string;
}): void {
	const pane = {
		kind: "browser",
		data: { url } satisfies BrowserPaneData,
	};
	const state = store.getState();

	if (target === "new-tab") {
		state.addTab({ panes: [pane] });
		return;
	}

	state.openPane({ pane });
}
