import type { Pane } from "@superset/panes";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { getOrCreateWorkspacePaneStore } from "./workspace-pane-registry";

export type LaunchPaneInput =
	| { kind: "terminal"; terminalId: string; label?: string }
	| { kind: "chat"; chatSessionId: string; label?: string };

interface PaneLocation {
	tabId: string;
	pane: Pane<PaneViewerData>;
}

/**
 * Add panes to a workspace's pane store for sessions that the host
 * already started (e.g. the result of `workspace.create()`). Each
 * launch becomes its own tab. Existing panes for the same session id
 * are deduplicated and refocused — calling this twice with the same
 * launch is idempotent.
 *
 * Attach-only: terminal launches do NOT carry an `initialCommand`.
 * The terminal pane attaches to a host-side process that's already
 * running. The legacy "renderer-mints-id, embeds-command" flow used
 * by `useV2PresetExecution` and the pending-row launch path is
 * unchanged and uses `addTab` directly.
 *
 * If the workspace has no `v2WorkspaceLocalState` row yet (e.g. this
 * runs before the route mounts and `ensureWorkspaceInSidebar` runs),
 * the panes are added to the in-memory store. They persist when the
 * row is later inserted and the next store change writes back.
 */
export function addLaunchPanes(
	workspaceId: string,
	launches: LaunchPaneInput[],
): void {
	if (launches.length === 0) return;

	const store = getOrCreateWorkspacePaneStore(workspaceId);
	let lastFocusedLocation: PaneLocation | null = null;

	for (const launch of launches) {
		const existing = findExistingPane(store.getState(), launch);
		if (existing) {
			lastFocusedLocation = existing;
			continue;
		}

		if (launch.kind === "terminal") {
			const data: TerminalPaneData = { terminalId: launch.terminalId };
			store.getState().addTab({
				titleOverride: launch.label,
				panes: [
					{
						kind: "terminal",
						titleOverride: launch.label,
						data: data as PaneViewerData,
					},
				],
			});
		} else {
			const data: ChatPaneData = { sessionId: launch.chatSessionId };
			store.getState().addTab({
				titleOverride: launch.label,
				panes: [
					{
						kind: "chat",
						titleOverride: launch.label,
						data: data as PaneViewerData,
					},
				],
			});
		}

		// addTab focuses the new tab itself (sets activeTabId). Capture the
		// landing pane so we can re-focus on the dedupe-only path below if
		// the dupe was the last entry.
		const newLocation = findExistingPane(store.getState(), launch);
		if (newLocation) lastFocusedLocation = newLocation;
	}

	if (lastFocusedLocation) {
		store.getState().setActivePane({
			tabId: lastFocusedLocation.tabId,
			paneId: lastFocusedLocation.pane.id,
		});
	}
}

function findExistingPane(
	state: ReturnType<
		ReturnType<typeof getOrCreateWorkspacePaneStore>["getState"]
	>,
	launch: LaunchPaneInput,
): PaneLocation | null {
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (launch.kind === "terminal" && pane.kind === "terminal") {
				const data = pane.data as TerminalPaneData;
				if (data.terminalId === launch.terminalId) {
					return { tabId: tab.id, pane };
				}
			} else if (launch.kind === "chat" && pane.kind === "chat") {
				const data = pane.data as ChatPaneData;
				if (data.sessionId === launch.chatSessionId) {
					return { tabId: tab.id, pane };
				}
			}
		}
	}
	return null;
}
