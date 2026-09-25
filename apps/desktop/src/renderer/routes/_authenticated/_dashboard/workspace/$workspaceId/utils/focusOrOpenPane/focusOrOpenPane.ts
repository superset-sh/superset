import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

/**
 * Focus the pane of `kind` whose data satisfies `isSame`, or open a new one
 * with `data` when none exists: `openPane` splits the active pane (or
 * replaces an unpinned pane of the same kind), `addTab` gives it a tab.
 */
export function focusOrOpenPane<TData extends PaneViewerData>(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	kind: string,
	isSame: (pane: TData) => boolean,
	data: TData,
	placement: "split" | "tab" = "split",
): void {
	const state = store.getState();
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== kind) continue;
			if (!isSame(pane.data as TData)) continue;
			state.setActiveTab(tab.id);
			state.setActivePane({ tabId: tab.id, paneId: pane.id });
			return;
		}
	}
	if (placement === "tab") {
		state.addTab({ panes: [{ kind, data }] });
		return;
	}
	state.openPane({ pane: { kind, data } });
}
