import type { CreatePaneInput, WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";

export const RUN_PANE_TITLE = "Workspace Run";

function makeRunTerminalPane(
	terminalId: string,
	paneId: string,
): CreatePaneInput<PaneViewerData> {
	return {
		id: paneId,
		kind: "terminal",
		titleOverride: RUN_PANE_TITLE,
		data: { terminalId } as TerminalPaneData,
	};
}

function findExistingRunPane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
): { tabId: string; paneId: string } | null {
	for (const tab of store.getState().tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind === "terminal" && pane.titleOverride === RUN_PANE_TITLE) {
				return { tabId: tab.id, paneId: pane.id };
			}
		}
	}
	return null;
}

export function placeRunTerminalPane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	terminalId: string,
): void {
	const newPaneId = crypto.randomUUID();
	const newPane = makeRunTerminalPane(terminalId, newPaneId);
	const existing = findExistingRunPane(store);

	if (existing) {
		store.getState().replacePane({
			tabId: existing.tabId,
			paneId: existing.paneId,
			newPane,
		});
		store.getState().setActivePane({
			tabId: existing.tabId,
			paneId: newPaneId,
		});
		store.getState().setActiveTab(existing.tabId);
		return;
	}

	const tabId = crypto.randomUUID();
	store.getState().addTab({ id: tabId, panes: [newPane] });
}
