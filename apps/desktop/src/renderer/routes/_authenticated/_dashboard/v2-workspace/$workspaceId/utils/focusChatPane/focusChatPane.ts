import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { ChatPaneData, PaneViewerData } from "../../types";

/**
 * Focus the chat pane for `sessionId` if one already exists in the layout,
 * otherwise open it in a new tab. The chat analogue of
 * `focusOrAddTerminalPane`.
 */
export function focusOrAddChatPane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	sessionId: string,
): void {
	const state = store.getState();
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "chat") continue;
			const data = pane.data as ChatPaneData;
			if (data.sessionId === sessionId) {
				state.setActiveTab(tab.id);
				state.setActivePane({ tabId: tab.id, paneId: pane.id });
				return;
			}
		}
	}
	state.addTab({
		panes: [
			{
				kind: "chat",
				data: { sessionId } as PaneViewerData,
			},
		],
	});
}
