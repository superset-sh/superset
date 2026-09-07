import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, SubagentPaneData } from "../../types";

/**
 * Focus the pane showing this subagent's transcript, creating one when none
 * exists. One pane per child: a second open for the same child focuses it.
 */
export function openSubagentPaneInStore(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	data: SubagentPaneData,
): void {
	const state = store.getState();
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "subagent") continue;
			const existing = pane.data as SubagentPaneData;
			if (
				existing.terminalId !== data.terminalId ||
				existing.subagentId !== data.subagentId
			) {
				continue;
			}
			state.setActiveTab(tab.id);
			state.setActivePane({ tabId: tab.id, paneId: pane.id });
			return;
		}
	}
	state.openPane({ pane: { kind: "subagent", data: data as PaneViewerData } });
}
