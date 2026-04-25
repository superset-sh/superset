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
import {
	getV2TerminalNotificationSource,
	useV2NotificationStore,
	type V2NotificationSourceInput,
} from "renderer/stores/v2-notifications";
import type { PaneViewerData } from "../../types";
import {
	getNotificationSourceId,
	isV2NotificationTargetVisible,
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
 * The layout-level `V2NotificationController` component is the active mount path:
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
			});
		},
		[workspaceId],
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
}: {
	workspaceId: string;
	payload: TerminalLifecyclePayload;
}): void {
	if (payload.eventType !== "exit") return;
	clearSources(workspaceId, [
		getV2TerminalNotificationSource(payload.terminalId),
	]);
}

/**
 * Writes agent-lifecycle status into the v2 notification store so workspace,
 * tab, and pane UI can derive attention from the same terminal source.
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
	const store = useV2NotificationStore.getState();
	const targetVisible = isV2NotificationTargetVisible({
		currentWorkspaceId: getCurrentWorkspaceId(),
		paneLayout,
		target,
	});
	const transition = resolveV2AgentStatusTransition({
		workspaceId,
		payload,
		statuses: store.sources,
		targetVisible,
	});

	clearSources(workspaceId, transition.clearSources);
	if (transition.setStatus) {
		store.setSourceStatus(
			transition.setStatus.source,
			workspaceId,
			transition.setStatus.status,
			payload.occurredAt,
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

function clearSources(
	workspaceId: string,
	sources: Array<V2NotificationSourceInput | null | undefined>,
): void {
	const store = useV2NotificationStore.getState();
	store.clearSourceStatuses(
		sources.filter((source): source is V2NotificationSourceInput =>
			Boolean(source),
		),
		workspaceId,
	);
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
