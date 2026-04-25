import type { WorkspaceState } from "@superset/panes";
import type {
	AgentLifecyclePayload,
	TerminalLifecyclePayload,
} from "@superset/workspace-client";
import { playRingtone } from "renderer/lib/ringtones/play";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useRingtoneStore } from "renderer/stores/ringtone";
import {
	getV2TerminalNotificationSource,
	useV2NotificationStore,
	type V2NotificationSourceInput,
} from "renderer/stores/v2-notifications";
import {
	isV2NotificationTargetVisible,
	resolveV2NotificationTarget,
	type V2NotificationTarget,
} from "./resolveV2NotificationTarget";
import { resolveV2AgentStatusTransition } from "./statusTransitions";

/**
 * Handles v2 lifecycle events received by V2NotificationController. Updates
 * pane status indicators (working/review/permission/idle) and plays the
 * selected ringtone in the renderer.
 *
 * Mirrors the v1 electron-main playback path
 * (apps/desktop/src/main/lib/notifications/notification-manager.ts) plus the
 * v1 sidebar-status path (renderer/stores/tabs/useAgentHookListener.ts), but
 * runs client-side so it works when host-service is off-machine.
 *
 * Keeps v1 behavior: skip `Start` for sound, suppress when the event's
 * pane is visible and the window is focused, and honor the existing
 * mute/volume settings.
 */
export function handleV2AgentLifecycleEvent({
	workspaceId,
	payload,
	paneLayout,
	volume,
	muted,
}: {
	workspaceId: string;
	payload: AgentLifecyclePayload;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
	volume: number;
	muted: boolean;
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

	showNativeNotification({ payload, workspaceId, target });
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
		// routes. Notifications are layout-level, so either can be active
		// while an event arrives.
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

function showNativeNotification({
	payload,
	workspaceId,
	target,
}: {
	payload: AgentLifecyclePayload;
	workspaceId: string;
	target: V2NotificationTarget;
}): void {
	const isPermission = payload.eventType === "PermissionRequest";
	const title = isPermission ? "Awaiting Response" : "Agent Complete";
	const body = isPermission
		? "Your agent needs input"
		: "Your agent has finished";

	void electronTrpcClient.notifications.showNative
		.mutate({
			title,
			body,
			silent: true,
			clickTarget: {
				workspaceId,
				source: { type: "terminal", id: target.terminalId },
			},
		})
		.catch((error) => {
			console.warn(
				"[notifications] failed to show native notification:",
				error,
			);
		});
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
