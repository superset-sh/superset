import type { WorkspaceStore } from "@superset/panes";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

export function useIsChatTabActive(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
): boolean {
	return useStore(store, (state) => {
		const tab = state.tabs.find(
			(candidate) => candidate.id === state.activeTabId,
		);
		if (!tab) return false;
		const panes = Object.values(tab.panes);
		return panes.length > 0 && panes.every((pane) => pane.kind === "chat-v3");
	});
}
