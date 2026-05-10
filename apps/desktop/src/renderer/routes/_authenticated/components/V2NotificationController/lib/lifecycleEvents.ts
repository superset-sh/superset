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
 * Updates pane status indicators (working/review/permission/idle) and plays
 * the completion chime client-side, so the playback path works when
 * host-service runs off-machine. The chime is suppressed when the target
 * pane is visible and the window is focused.
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

	// Only Stop and PermissionRequest deserve sound. Start fires per-prompt
	// (the working spinner is feedback enough); Attached/Detached fire on
	// agent boot and clean exit, neither of which is a "your agent finished"
	// moment.
	if (
		payload.eventType === "Start" ||
		payload.eventType === "Attached" ||
		payload.eventType === "Detached"
	) {
		return;
	}
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
		// Matches both `/workspace/<id>` and `/v2-workspace/<id>` route shapes.
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
