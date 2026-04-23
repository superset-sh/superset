import type { AgentLifecyclePayload } from "@superset/workspace-client";
import { useCallback } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { playRingtone } from "renderer/lib/ringtones/play";
import { useRingtoneStore } from "renderer/stores/ringtone";
import { useTabsStore } from "renderer/stores/tabs";
import { useV2PaneStatusStore } from "renderer/stores/v2-pane-status";
import { isPaneVisible } from "./isPaneVisible";

/**
 * Listens for v2 agent lifecycle events over the host-service WebSocket,
 * updates pane status indicators (working/review/permission/idle) and
 * plays the selected ringtone in the renderer. Mirrors the v1 electron-main
 * playback path (see apps/desktop/src/main/lib/notifications/notification-manager.ts)
 * plus the v1 sidebar-status path (renderer/stores/tabs/useAgentHookListener.ts),
 * but runs client-side so it works when host-service is off-machine.
 *
 * Keeps v1 behavior: skip `Start` for sound, suppress when the event's
 * pane is visible and the window is focused, and honor the existing
 * mute/volume settings.
 *
 * Mount once per v2 workspace you want to receive events for. The
 * layout-level `V2AgentHookListenersMount` component iterates every open
 * workspace so backgrounded workspaces also light up the sidebar.
 */
export function useV2AgentHookListener(workspaceId: string): void {
	const { data: volume = 100 } =
		electronTrpc.settings.getNotificationVolume.useQuery();
	const { data: muted = false } =
		electronTrpc.settings.getNotificationSoundsMuted.useQuery();

	const handleEvent = useCallback(
		(payload: AgentLifecyclePayload) => {
			updatePaneStatus(workspaceId, payload);

			if (payload.eventType === "Start") return;
			if (shouldSuppress(workspaceId, payload)) return;

			const ringtoneId = useRingtoneStore.getState().selectedRingtoneId;
			void playRingtone({ ringtoneId, volume, muted });

			showNativeNotification(payload, workspaceId);
		},
		[workspaceId, volume, muted],
	);

	useWorkspaceEvent("agent:lifecycle", workspaceId, handleEvent);
}

/**
 * Writes pane agent-lifecycle status into the v2 pane-status store so the
 * dashboard sidebar icon can pick it up. V2 panes are not tracked in the
 * v1 `useTabsStore`, so this is its own source of truth.
 *
 * The Stop transition mirrors v1 (useAgentHookListener.ts): clear to idle
 * when the user is currently looking at this workspace (they'll see the
 * result immediately); otherwise mark review so the sidebar surfaces it.
 */
function updatePaneStatus(
	workspaceId: string,
	payload: AgentLifecyclePayload,
): void {
	// V2 terminals expose `SUPERSET_TERMINAL_ID` but not `SUPERSET_PANE_ID`
	// (panes are a client-side layout concept in v2, unknown to host-service),
	// and agents frequently send empty strings for missing fields — not
	// undefined — so `??` is wrong here. `firstNonBlank` falls through
	// empties to the next candidate. The sidebar selector only filters on
	// workspaceId, so any non-empty unique id per agent is fine.
	const paneId = firstNonBlank(
		payload.paneId,
		payload.terminalId,
		payload.sessionId,
		payload.hookSessionId,
		payload.resourceId,
	);
	if (!paneId) return;
	const store = useV2PaneStatusStore.getState();

	if (payload.eventType === "Start") {
		store.setPaneStatus(paneId, workspaceId, "working");
		return;
	}

	if (payload.eventType === "PermissionRequest") {
		store.setPaneStatus(paneId, workspaceId, "permission");
		return;
	}

	if (payload.eventType === "Stop") {
		const prev = store.statuses[paneId]?.status;
		const viewing = isCurrentWorkspace(workspaceId);
		const nextStatus = prev === "permission" || viewing ? "idle" : "review";
		if (nextStatus === "idle") {
			store.clearPaneStatus(paneId);
		} else {
			store.setPaneStatus(paneId, workspaceId, nextStatus);
		}
	}
}

function firstNonBlank(
	...values: (string | undefined | null)[]
): string | null {
	for (const v of values) {
		if (v && v.length > 0) return v;
	}
	return null;
}

function isCurrentWorkspace(workspaceId: string): boolean {
	try {
		const match = window.location.hash.match(/\/workspace\/([^/?#]+)/);
		return match?.[1] === workspaceId;
	} catch {
		return false;
	}
}

function shouldSuppress(
	workspaceId: string,
	payload: AgentLifecyclePayload,
): boolean {
	if (!payload.paneId || !payload.tabId) return false;
	if (typeof document !== "undefined" && document.hidden) return false;
	if (typeof window !== "undefined" && !document.hasFocus()) return false;

	const tabsState = useTabsStore.getState();
	return isPaneVisible({
		currentWorkspaceId: workspaceId,
		tabsState: {
			activeTabIds: tabsState.activeTabIds,
			focusedPaneIds: tabsState.focusedPaneIds,
		},
		pane: {
			workspaceId,
			tabId: payload.tabId,
			paneId: payload.paneId,
		},
	});
}

function showNativeNotification(
	payload: AgentLifecyclePayload,
	workspaceId: string,
): void {
	if (typeof Notification === "undefined") return;
	if (Notification.permission !== "granted") return;

	const isPermission = payload.eventType === "PermissionRequest";
	const title = isPermission ? "Awaiting Response" : "Agent Complete";
	const body = isPermission
		? "Your agent needs input"
		: "Your agent has finished";

	try {
		new Notification(title, {
			body,
			tag: `${workspaceId}:${payload.paneId ?? payload.sessionId ?? "_"}`,
			silent: true,
		});
	} catch {
		// Notification constructor can throw if the permission was revoked
		// between the check and the call. Non-fatal.
	}
}
