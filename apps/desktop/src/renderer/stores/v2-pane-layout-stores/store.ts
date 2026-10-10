import type { WorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { StoreApi } from "zustand";

type PaneLayoutStore = StoreApi<WorkspaceStore<PaneViewerData>>;

const stores = new Map<string, PaneLayoutStore>();

/** Main pane layouts mounted in this renderer, so outside edits apply live. */
export function registerV2PaneLayoutStore(
	workspaceId: string,
	store: PaneLayoutStore,
): () => void {
	stores.set(workspaceId, store);
	return () => {
		if (stores.get(workspaceId) === store) stores.delete(workspaceId);
	};
}

export function getV2PaneLayoutStore(
	workspaceId: string,
): PaneLayoutStore | undefined {
	return stores.get(workspaceId);
}
