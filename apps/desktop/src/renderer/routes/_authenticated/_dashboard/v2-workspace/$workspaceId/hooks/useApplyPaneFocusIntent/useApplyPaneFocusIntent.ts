import type { WorkspaceStore } from "@superset/panes";
import { useEffect } from "react";
import { usePaneFocusIntent } from "renderer/stores/pane-focus-intent";
import type { StoreApi } from "zustand";
import type { PaneViewerData } from "../../types";
import {
	applyFocusIntent,
	type FocusIntentStoreState,
} from "./applyFocusIntent";

/**
 * Applies a pending pane-focus request from the Ctrl+Tab switcher.
 *
 * On a cross-workspace switch the request is filed before this route exists,
 * and the pane store starts empty when it mounts, so the request is retried on
 * mount, on every store change, and on every new request. The decision itself
 * lives in `applyFocusIntent`.
 */
export function useApplyPaneFocusIntent({
	store,
	workspaceId,
	isLayoutReady,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
	isLayoutReady: boolean;
}) {
	useEffect(() => {
		// Belt and braces alongside the clear-before-write in applyFocusIntent:
		// this runs as a store subscriber and also writes to that store.
		let isApplying = false;

		const apply = () => {
			if (isApplying) return;
			isApplying = true;
			try {
				const { target, clear } = usePaneFocusIntent.getState();
				applyFocusIntent({
					target,
					workspaceId,
					state: store.getState() as unknown as FocusIntentStoreState,
					isLayoutReady,
					clear,
				});
			} finally {
				isApplying = false;
			}
		};

		apply();

		const unsubscribeStore = store.subscribe(apply);
		const unsubscribeIntent = usePaneFocusIntent.subscribe(
			(state, previous) => {
				if (state.tick !== previous.tick) apply();
			},
		);

		return () => {
			unsubscribeStore();
			unsubscribeIntent();
		};
	}, [store, workspaceId, isLayoutReady]);
}
