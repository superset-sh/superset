import type { WorkspaceStore } from "@superset/panes";
import { useEffect } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

export function subscribePaneAreaEmptied(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	onEmptied: () => void,
): () => void {
	let hadTabs = store.getState().tabs.length > 0;
	return store.subscribe((state) => {
		const hasTabs = state.tabs.length > 0;
		if (hadTabs && !hasTabs) onEmptied();
		hadTabs = hasTabs;
	});
}

export function useCloseRightPaneAreaWhenEmpty({
	store,
	enabled,
	close,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	enabled: boolean;
	close: () => void;
}): void {
	useEffect(() => {
		if (!enabled) return;
		return subscribePaneAreaEmptied(store, close);
	}, [store, enabled, close]);
}
