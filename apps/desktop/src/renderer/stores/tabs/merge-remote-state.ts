import type { Pane } from "shared/tabs-types";
import type { Tab, TabsState } from "./types";
import { resolveActiveTabIdForWorkspace } from "./utils";

/**
 * Structure arriving over the cross-window broadcast (persisted shape:
 * structure + the writer's selection, which we deliberately ignore).
 */
export interface RemoteTabsState {
	tabs: Tab[];
	panes: Record<string, Pane>;
}

type MergeInput = Pick<
	TabsState,
	"panes" | "activeTabIds" | "focusedPaneIds" | "tabHistoryStacks"
>;

type MergeResult = Pick<
	TabsState,
	"tabs" | "panes" | "activeTabIds" | "focusedPaneIds" | "tabHistoryStacks"
>;

/**
 * Merges a remote (cross-window) tabs-state broadcast into local state.
 *
 * Rules:
 * - Structure (tabs, panes) comes from remote — it is the persisted truth.
 * - Panes merge per-id so renderer-only runtime fields a window tracks
 *   locally survive (the persisted schema strips transient fields; a blind
 *   replace would degrade local panes).
 * - Selection (activeTabIds, focusedPaneIds) and history stay LOCAL — that is
 *   what lets two windows sit on different tabs of the same workspace. Only
 *   references to structure that no longer exists are repaired.
 */
export function mergeRemoteTabsState(
	local: MergeInput,
	remote: RemoteTabsState,
): MergeResult {
	const panes: Record<string, Pane> = {};
	for (const [paneId, remotePane] of Object.entries(remote.panes)) {
		const localPane = local.panes[paneId];
		if (!localPane) {
			panes[paneId] = remotePane;
			continue;
		}
		// Remote structural fields win, but pane status is window-local runtime
		// state (each window tracks its own agent lifecycle events) — a remote
		// snapshot captured before a local status change must not flap it back.
		panes[paneId] = {
			...localPane,
			...remotePane,
			status: localPane.status ?? remotePane.status,
		};
	}

	const tabsById = new Map(remote.tabs.map((tab) => [tab.id, tab]));

	// Repair before reuse: filter history to surviving tabs first, then let the
	// store's canonical resolver (current → MRU history → first tab) repair any
	// active-tab reference that points at remotely-closed structure.
	const tabHistoryStacks: Record<string, string[]> = {};
	for (const [workspaceId, stack] of Object.entries(local.tabHistoryStacks)) {
		tabHistoryStacks[workspaceId] = stack.filter((tabId) =>
			tabsById.has(tabId),
		);
	}

	const activeTabIds = { ...local.activeTabIds };
	for (const [workspaceId, tabId] of Object.entries(activeTabIds)) {
		if (tabId && !tabsById.has(tabId)) {
			activeTabIds[workspaceId] = resolveActiveTabIdForWorkspace({
				workspaceId,
				tabs: remote.tabs,
				activeTabIds,
				tabHistoryStacks,
			});
		}
	}

	const focusedPaneIds: Record<string, string> = {};
	for (const [tabId, paneId] of Object.entries(local.focusedPaneIds)) {
		if (!tabsById.has(tabId)) continue;
		const pane = panes[paneId];
		if (pane && pane.tabId === tabId) {
			focusedPaneIds[tabId] = paneId;
			continue;
		}
		const fallback = Object.values(panes).find(
			(candidate) => candidate.tabId === tabId,
		);
		if (fallback) {
			focusedPaneIds[tabId] = fallback.id;
		}
	}

	return {
		tabs: remote.tabs,
		panes,
		activeTabIds,
		focusedPaneIds,
		tabHistoryStacks,
	};
}
