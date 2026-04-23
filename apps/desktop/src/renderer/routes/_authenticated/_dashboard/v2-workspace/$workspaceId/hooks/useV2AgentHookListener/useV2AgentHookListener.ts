import type { AgentLifecyclePayload } from "@superset/workspace-client";
import { useCallback } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { playRingtone } from "renderer/lib/ringtones/play";
import { useRingtoneStore } from "renderer/stores/ringtone";
import { useTabsStore } from "renderer/stores/tabs";
import { isPaneVisible } from "./isPaneVisible";

/**
 * Listens for v2 agent lifecycle events over the host-service WebSocket and
 * plays the selected ringtone in the renderer. Mirrors the v1 electron-main
 * playback path (see apps/desktop/src/main/lib/notifications/notification-manager.ts)
 * but runs client-side so it works when host-service is off-machine.
 *
 * Keeps v1 behavior: skip `Start`, suppress when the event's pane is visible
 * and the window is focused, and honor the existing mute/volume settings.
 */
export function useV2AgentHookListener(workspaceId: string): void {
	const { data: volume = 100 } =
		electronTrpc.settings.getNotificationVolume.useQuery();
	const { data: muted = false } =
		electronTrpc.settings.getNotificationSoundsMuted.useQuery();

	const handleEvent = useCallback(
		(payload: AgentLifecyclePayload) => {
			if (payload.eventType === "Start") return;
			if (shouldSuppress(workspaceId, payload)) return;

			const ringtoneId =
				useRingtoneStore.getState().selectedRingtoneId;
			void playRingtone({ ringtoneId, volume, muted });

			showNativeNotification(payload, workspaceId);
		},
		[workspaceId, volume, muted],
	);

	useWorkspaceEvent("agent:lifecycle", workspaceId, handleEvent);
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
