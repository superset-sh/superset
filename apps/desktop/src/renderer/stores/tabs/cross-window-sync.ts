import type { Unsubscribable } from "@trpc/server/observable";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { BaseTab, Pane } from "shared/tabs-types";
import {
	mergeRemoteTabsState,
	type RemoteTabsState,
} from "./merge-remote-state";
import { runWithRemoteTabsApply } from "./remote-apply";
import { useTabsStore } from "./store";
import type { Tab } from "./types";

/**
 * Narrow a wire/persisted tabs-state to the structure we apply across windows.
 *
 * The persisted shape types `tabs` as `BaseTab` (no `layout`), but the
 * `uiState.tabs.set` schema (`tabsStateSchema`) requires `layout`, so every tab
 * on the wire carries it at runtime — the persistence type just widens it away.
 * The `as Tab[]` is a direct downcast (not `as unknown as`) that makes the
 * structural intent explicit: we read only tabs + panes; selection is dropped.
 */
function toRemoteStructure(state: {
	tabs: BaseTab[];
	panes: Record<string, Pane>;
}): RemoteTabsState {
	return { tabs: state.tabs as Tab[], panes: state.panes };
}

/**
 * Cross-window tabs synchronization.
 *
 * Every window subscribes to `uiState.tabs.onChange`, which fires on each
 * persisted tabs-state write from any window. Remote events apply STRUCTURE
 * only (tabs + panes); selection (`activeTabIds`, `focusedPaneIds`) and tab
 * history stay local so each window can sit on a different tab/pane of the
 * same workspace. Self-originated events are dropped by webContents id, and
 * the persistence adapter suppresses the echo write while a remote apply is
 * in flight (see remote-apply.ts).
 */

export function applyRemoteTabsState(remote: RemoteTabsState): void {
	runWithRemoteTabsApply(() => {
		useTabsStore.setState((local) => mergeRemoteTabsState(local, remote));
	});
}

// Process-lifetime subscription with retry — mirrors keyboardLayoutStore,
// but keeps the handle so a retry never stacks a second live subscription.
const RETRY_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000];
let retryAttempt = 0;
let started = false;
let activeSubscription: Unsubscribable | null = null;

async function subscribe(): Promise<void> {
	// Resolve our own identity first so self-originated broadcasts can be
	// dropped. Without it we could double-apply our own writes.
	const self = await electronTrpcClient.window.self.query();
	const ownWebContentsId = self?.webContentsId ?? null;

	activeSubscription?.unsubscribe();
	activeSubscription = electronTrpcClient.uiState.tabs.onChange.subscribe(
		undefined,
		{
			onStarted: () => {
				if (import.meta.env.DEV) {
					console.log(
						"[cross-window-sync] subscribed (webContentsId:",
						ownWebContentsId,
						")",
					);
				}
				// Catch up on broadcasts emitted between hydration and subscribe —
				// without this the window shows stale structure until the next
				// remote write.
				electronTrpcClient.uiState.tabs.get
					.query()
					.then((state) => applyRemoteTabsState(toRemoteStructure(state)))
					.catch((err) => {
						console.error("[cross-window-sync] catch-up fetch failed:", err);
					});
			},
			onData: (event) => {
				retryAttempt = 0;
				if (
					ownWebContentsId !== null &&
					event.sourceWebContentsId === ownWebContentsId
				) {
					return;
				}
				applyRemoteTabsState(toRemoteStructure(event.state));
			},
			onError: (err) => {
				console.error("[cross-window-sync] subscription error:", err);
				scheduleRetry();
			},
		},
	);
}

function scheduleRetry(): void {
	const idx = Math.min(retryAttempt, RETRY_BACKOFF_MS.length - 1);
	const delay = RETRY_BACKOFF_MS[idx] ?? 10_000;
	retryAttempt++;
	setTimeout(() => {
		subscribe().catch((err) => {
			console.error("[cross-window-sync] resubscribe failed:", err);
			scheduleRetry();
		});
	}, delay);
}

/**
 * Starts the subscription once the persisted store has hydrated — applying a
 * remote event before hydration would be overwritten by the hydrate result.
 */
export function startCrossWindowTabsSync(): void {
	if (started) return;
	started = true;

	const begin = () => {
		subscribe().catch((err) => {
			console.error("[cross-window-sync] initial subscribe failed:", err);
			scheduleRetry();
		});
	};

	if (useTabsStore.persist.hasHydrated()) {
		begin();
	} else {
		useTabsStore.persist.onFinishHydration(begin);
	}
}
