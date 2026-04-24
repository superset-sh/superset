import type { AgentLifecyclePayload } from "@superset/workspace-client";
import type { PaneStatus } from "shared/tabs-types";
import type { V2NotificationTarget } from "./resolveV2NotificationTarget";
import { getNotificationSourceIds } from "./resolveV2NotificationTarget";

interface StatusEntry {
	workspaceId: string;
	status: PaneStatus;
}

export interface V2AgentStatusTransition {
	clearIds: string[];
	setStatus: { id: string; status: PaneStatus } | null;
}

export function resolveV2AgentStatusTransition({
	workspaceId,
	payload,
	target,
	statuses,
	targetVisible,
}: {
	workspaceId: string;
	payload: AgentLifecyclePayload;
	target: V2NotificationTarget;
	statuses: Record<string, StatusEntry | undefined>;
	targetVisible: boolean;
}): V2AgentStatusTransition {
	const statusIds = new Set(getNotificationSourceIds(payload));
	if (target.paneId) statusIds.add(target.paneId);

	const primaryId = target.terminalId;
	statusIds.add(primaryId);
	const alternateIds = [...statusIds].filter((id) => id !== primaryId);

	if (payload.eventType === "Start") {
		return {
			clearIds: alternateIds,
			setStatus: { id: primaryId, status: "working" },
		};
	}

	if (payload.eventType === "PermissionRequest") {
		return {
			clearIds: alternateIds,
			setStatus: { id: primaryId, status: "permission" },
		};
	}

	const allIds = [primaryId, ...alternateIds];
	const wasAwaitingPermission = allIds.some((id) => {
		const entry = statuses[id];
		return entry?.workspaceId === workspaceId && entry.status === "permission";
	});
	if (wasAwaitingPermission || targetVisible) {
		return { clearIds: allIds, setStatus: null };
	}

	return {
		clearIds: alternateIds,
		setStatus: { id: primaryId, status: "review" },
	};
}
