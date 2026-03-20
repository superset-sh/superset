import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { setSkipNextTabsPersist } from "renderer/lib/trpc-storage";
import { useTabsStore } from "./store";
import type { TabsState } from "./types";

/**
 * Subscribes to tab state changes from other windows and syncs into the local store.
 * Mirrors the useHotkeysSync pattern: subscription fires → fetch fresh state → replace if different.
 * Uses last-write-wins for conflict resolution (acceptable for MVP).
 *
 * Only syncs structural state (tabs, panes, tabHistoryStacks). Per-window view state
 * (activeTabIds, focusedPaneIds) is intentionally excluded so each window can
 * independently view different tabs.
 */
export function useTabsSync() {
	electronTrpc.uiState.tabs.subscribe.useSubscription(undefined, {
		onData: () => {
			electronTrpcClient.uiState.tabs.get
				.query()
				.then((remoteState) => {
					if (!remoteState) {
						console.warn(
							"[tabs] Storage returned null/undefined state, skipping sync",
						);
						return;
					}

					// The tRPC return type is BaseTabsState, but at runtime the lowdb
					// data includes layout (validated by tabsStateSchema). Cast to the
					// renderer's TabsState which adds the layout field to tabs.
					const state = remoteState as unknown as TabsState;

					const current = useTabsStore.getState();

					// Only compare structural fields — activeTabIds and focusedPaneIds
					// are per-window view state and should not be synced.
					const currentStructural = {
						tabs: current.tabs,
						panes: current.panes,
						tabHistoryStacks: current.tabHistoryStacks,
					};
					const remoteStructural = {
						tabs: state.tabs,
						panes: state.panes,
						tabHistoryStacks: state.tabHistoryStacks,
					};
					const currentStr = JSON.stringify(currentStructural);
					const remoteStr = JSON.stringify(remoteStructural);

					if (currentStr === remoteStr) {
						return;
					}

					// Skip persistence to avoid echo writes back to storage
					setSkipNextTabsPersist(true);
					// Merge: take structural data from remote, keep local view state
					useTabsStore.setState({
						tabs: state.tabs,
						panes: state.panes,
						tabHistoryStacks: state.tabHistoryStacks,
					});
				})
				.catch((error: unknown) => {
					console.error("[tabs] Failed to sync tabs:", error);
				});
		},
	});
}
