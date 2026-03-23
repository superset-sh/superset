import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { PaneWorkspaceStore } from "../../../core/store";

export function usePaneWorkspaceStore<TPaneData, TSelected>(
	store: StoreApi<PaneWorkspaceStore<TPaneData>>,
	selector: (state: PaneWorkspaceStore<TPaneData>) => TSelected,
): TSelected {
	return useStore(store, selector);
}
