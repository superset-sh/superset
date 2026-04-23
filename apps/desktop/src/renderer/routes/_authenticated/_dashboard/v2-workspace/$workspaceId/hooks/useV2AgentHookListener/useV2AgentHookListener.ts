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
 */
export function useV2AgentHookListener(workspaceId: string): void {
	const { data: volume = 100 } =
		electronTrpc.settings.getNotificationVolume.useQuery();
	const { data: muted = false } =
		electronTrpc.settings.getNotificationSoundsMuted.useQuery();

	const handleEvent = useCallback(
		(payload: AgentLifecyclePayload) => {
			console.log("[useV2AgentHookListener] handleEvent", {
				workspaceId,
				eventType: payload.eventType,
				paneId: payload.paneId,
				tabId: payload.tabId,
			});
			updatePaneStatus(workspaceId, payload);

			if (payload.eventType === "Start") return;
			const suppress = shouldSuppress(workspaceId, payload);
			console.log("[useV2AgentHookListener] suppress check", {
				suppress,
				eventType: payload.eventType,
			});
			if (suppress) return;

			const ringtoneId = useRingtoneStore.getState().selectedRingtoneId;
			console.log("[useV2AgentHookListener] playing ringtone", {
				ringtoneId,
				volume,
				muted,
			});
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
	// V2 terminals don't have a `paneId` (those live in the client-side
	// panes store); fall back to terminalId / sessionId / hookSessionId as
	// the unique key. The sidebar selector only filters on workspaceId so
	// any non-empty unique id per running agent is fine — we just need
	// SOMETHING to distinguish concurrent agents in the same workspace.
	//
	// Agent payloads frequently send empty strings (""), not missing
	// fields, so `??` is wrong here — use a blank-string coalesce.
	const paneId = firstNonBlank(
		payload.paneId,
		payload.terminalId,
		payload.sessionId,
		payload.hookSessionId,
		payload.resourceId,
	);
	if (!paneId) {
		console.log(
			"[useV2AgentHookListener] updatePaneStatus skipped — no identifier",
			payload,
		);
		return;
	}
	const store = useV2PaneStatusStore.getState();

	if (payload.eventType === "Start") {
		console.log("[useV2AgentHookListener] setPaneStatus working", { paneId });
		store.setPaneStatus(paneId, workspaceId, "working");
		return;
	}

	if (payload.eventType === "PermissionRequest") {
		console.log("[useV2AgentHookListener] setPaneStatus permission", {
			paneId,
		});
		store.setPaneStatus(paneId, workspaceId, "permission");
		return;
	}

	if (payload.eventType === "Stop") {
		const prev = store.statuses[paneId]?.status;
		const viewing = isCurrentWorkspace(workspaceId);
		const nextStatus = prev === "permission" || viewing ? "idle" : "review";
		console.log("[useV2AgentHookListener] Stop -> transition", {
			paneId,
			prev,
			viewing,
			nextStatus,
		});
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
