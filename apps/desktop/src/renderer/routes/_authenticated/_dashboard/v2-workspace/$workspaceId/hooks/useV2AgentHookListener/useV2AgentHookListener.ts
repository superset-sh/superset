import type { WorkspaceState } from "@superset/panes";
import type {
	AgentLifecyclePayload,
	TerminalLifecyclePayload,
} from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { playRingtone } from "renderer/lib/ringtones/play";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useRingtoneStore } from "renderer/stores/ringtone";
import { useV2PaneStatusStore } from "renderer/stores/v2-pane-status";
import type { PaneViewerData } from "../../types";
import {
	getNotificationSourceId,
	isV2NotificationTargetVisible,
	resolveTerminalTarget,
	resolveV2NotificationTarget,
	type V2NotificationTarget,
} from "./resolveV2NotificationTarget";
import { resolveV2AgentStatusTransition } from "./statusTransitions";

type Navigate = ReturnType<typeof useNavigate>;

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
 * The layout-level `V2AgentHookListeners` component is the active mount path:
 * it subscribes once per host so backgrounded workspaces also light up the
 * sidebar.
 */
export function useV2AgentHookListener(workspaceId: string): void {
	const navigate = useNavigate();
	const collections = useCollections();
	const { data: volume = 100 } =
		electronTrpc.settings.getNotificationVolume.useQuery();
	const { data: muted = false } =
		electronTrpc.settings.getNotificationSoundsMuted.useQuery();
	const { data: localWorkspaceRows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
				.where(({ v2WorkspaceLocalState }) =>
					eq(v2WorkspaceLocalState.workspaceId, workspaceId),
				),
		[collections, workspaceId],
	);
	const paneLayout = useMemo(
		() =>
			(localWorkspaceRows[0]?.paneLayout as
				| WorkspaceState<PaneViewerData>
				| undefined) ?? null,
		[localWorkspaceRows],
	);

	const handleEvent = useCallback(
		(payload: AgentLifecyclePayload) => {
			handleV2AgentLifecycleEvent({
				workspaceId,
				payload,
				paneLayout,
				volume,
				muted,
				navigate,
			});
		},
		[workspaceId, paneLayout, volume, muted, navigate],
	);

	const handleTerminalLifecycle = useCallback(
		(payload: TerminalLifecyclePayload) => {
			handleV2TerminalLifecycleEvent({
				workspaceId,
				payload,
				paneLayout,
			});
		},
		[workspaceId, paneLayout],
	);

	useWorkspaceEvent("agent:lifecycle", workspaceId, handleEvent);
	useWorkspaceEvent("terminal:lifecycle", workspaceId, handleTerminalLifecycle);
}

export function handleV2AgentLifecycleEvent({
	workspaceId,
	payload,
	paneLayout,
	volume,
	muted,
	navigate,
}: {
	workspaceId: string;
	payload: AgentLifecyclePayload;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
	volume: number;
	muted: boolean;
	navigate: Navigate;
}): void {
	const target = resolveV2NotificationTarget({
		workspaceId,
		payload,
		paneLayout,
	});
	updatePaneStatus(workspaceId, payload, target, paneLayout);

	if (payload.eventType === "Start") return;
	if (shouldSuppress(target, paneLayout)) return;

	const ringtoneId = useRingtoneStore.getState().selectedRingtoneId;
	void playRingtone({ ringtoneId, volume, muted });

	showNativeNotification(payload, workspaceId, () => {
		openNotificationTarget(navigate, workspaceId, target);
	});
}

export function handleV2TerminalLifecycleEvent({
	workspaceId,
	payload,
	paneLayout,
}: {
	workspaceId: string;
	payload: TerminalLifecyclePayload;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
}): void {
	if (payload.eventType !== "exit") return;
	const target = resolveTerminalTarget({
		workspaceId,
		terminalId: payload.terminalId,
		paneLayout,
	});
	clearStatusIds(workspaceId, [payload.terminalId, target?.paneId]);
}

/**
 * Writes pane agent-lifecycle status into the v2 pane-status store so the
 * dashboard sidebar icon can pick it up. V2 panes are not tracked in the
 * v1 `useTabsStore`, so this is its own source of truth.
 *
 * The Stop transition mirrors v1 (useAgentHookListener.ts), but uses the v2
 * pane layout instead of workspace-level guessing: clear to idle when the
 * exact target pane is visible, otherwise mark review so the sidebar surfaces
 * it.
 */
function updatePaneStatus(
	workspaceId: string,
	payload: AgentLifecyclePayload,
	target: V2NotificationTarget,
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined,
): void {
	const store = useV2PaneStatusStore.getState();
	const targetVisible = isV2NotificationTargetVisible({
		currentWorkspaceId: getCurrentWorkspaceId(),
		paneLayout,
		target,
	});
	const transition = resolveV2AgentStatusTransition({
		workspaceId,
		payload,
		target,
		statuses: store.statuses,
		targetVisible,
	});

	clearStatusIds(workspaceId, transition.clearIds);
	if (transition.setStatus) {
		store.setPaneStatus(
			transition.setStatus.id,
			workspaceId,
			transition.setStatus.status,
		);
	}
}

function getCurrentWorkspaceId(): string | null {
	try {
		// Matches both v1 `/workspace/<id>` and v2 `/v2-workspace/<id>`
		// routes — the hook runs in a mixed-UI window so either can be
		// the active URL while an event arrives.
		const match = window.location.hash.match(/\/(?:v2-)?workspace\/([^/?#]+)/);
		return match ? decodeURIComponent(match[1] ?? "") : null;
	} catch {
		return null;
	}
}

function shouldSuppress(
	target: V2NotificationTarget,
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined,
): boolean {
	if (typeof document !== "undefined" && document.hidden) return false;
	if (typeof window !== "undefined" && !document.hasFocus()) return false;

	return isV2NotificationTargetVisible({
		currentWorkspaceId: getCurrentWorkspaceId(),
		paneLayout,
		target,
	});
}

function showNativeNotification(
	payload: AgentLifecyclePayload,
	workspaceId: string,
	onClick: () => void,
): void {
	if (typeof Notification === "undefined") return;
	if (Notification.permission !== "granted") return;

	const isPermission = payload.eventType === "PermissionRequest";
	const title = isPermission ? "Awaiting Response" : "Agent Complete";
	const body = isPermission
		? "Your agent needs input"
		: "Your agent has finished";

	const tagId = getNotificationSourceId(payload);

	try {
		const notification = new Notification(title, {
			body,
			tag: `${workspaceId}:${tagId}`,
			silent: true,
		});
		notification.onclick = (event) => {
			event.preventDefault();
			onClick();
			notification.close();
		};
	} catch {
		// Notification constructor can throw if the permission was revoked
		// between the check and the call. Non-fatal.
	}
}

function clearStatusIds(
	workspaceId: string,
	ids: Array<string | null | undefined>,
): void {
	const store = useV2PaneStatusStore.getState();
	const uniqueIds = new Set(ids.filter((id): id is string => Boolean(id)));
	for (const id of uniqueIds) {
		if (store.statuses[id]?.workspaceId === workspaceId) {
			store.clearPaneStatus(id);
		}
	}
}

function openNotificationTarget(
	navigate: Navigate,
	workspaceId: string,
	target: V2NotificationTarget,
): void {
	if (typeof window !== "undefined") {
		window.focus();
		localStorage.setItem("lastViewedWorkspaceId", workspaceId);
	}

	void navigate({
		to: "/v2-workspace/$workspaceId",
		params: { workspaceId },
		search: {
			terminalId: target.terminalId,
		},
	});
}
