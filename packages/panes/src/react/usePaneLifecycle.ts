import { useEffect } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceStore } from "../core/store";
import type { PaneRegistry } from "./types";

/**
 * Subscribes to action-level pane removals on the workspace store and
 * dispatches to each pane definition's `onAfterClose` handler. Call once
 * at the page/route level alongside whatever produces the registry.
 *
 * The subscription only fires for closePane / removeTab / replacePane —
 * not for replaceState (workspace switch / sync hydration), so terminals
 * and other resources aren't torn down by transient layout swaps.
 */
export function usePaneLifecycle<TData>(
	store: StoreApi<WorkspaceStore<TData>>,
	registry: PaneRegistry<TData>,
) {
	useEffect(
		() =>
			store.getState().subscribePaneRemovals((pane) => {
				registry[pane.kind]?.onAfterClose?.(pane);
			}),
		[store, registry],
	);
}
