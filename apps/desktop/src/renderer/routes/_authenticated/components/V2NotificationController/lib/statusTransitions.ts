import type { AgentLifecyclePayload } from "@superset/workspace-client";
import {
	getV2NotificationSourceKey,
	getV2TerminalNotificationSource,
	type V2NotificationSource,
	type V2NotificationSourceInput,
} from "renderer/stores/v2-notifications";
import type { ActivePaneStatus, PaneStatus } from "shared/tabs-types";

interface StatusEntry {
	workspaceId: string;
	status: PaneStatus;
}

export interface V2AgentStatusTransition {
	clearSources: V2NotificationSourceInput[];
	setStatus: { source: V2NotificationSource; status: ActivePaneStatus } | null;
}

export function resolveV2AgentStatusTransition({
	workspaceId,
	payload,
	statuses,
	targetVisible,
}: {
	workspaceId: string;
	payload: AgentLifecyclePayload;
	statuses: Record<string, StatusEntry | undefined>;
	targetVisible: boolean;
}): V2AgentStatusTransition {
	const terminalSource = getV2TerminalNotificationSource(payload.terminalId);
	const terminalSourceKey = getV2NotificationSourceKey(terminalSource);

	// Attach is an idle signal — it binds the pane icon (handled in
	// HostNotificationSubscriber) but must not flip the pane to "working".
	if (payload.eventType === "Attached") {
		return { clearSources: [], setStatus: null };
	}
	if (payload.eventType === "Detached") {
		const entry = statuses[terminalSourceKey];
		const shouldClearTransient =
			entry?.workspaceId === workspaceId &&
			(entry.status === "working" || entry.status === "permission");
		return shouldClearTransient
			? { clearSources: [terminalSource], setStatus: null }
			: { clearSources: [], setStatus: null };
	}

	if (payload.eventType === "Start") {
		return {
			clearSources: [],
			setStatus: { source: terminalSource, status: "working" },
		};
	}

	if (payload.eventType === "PermissionRequest") {
		return {
			clearSources: [],
			setStatus: { source: terminalSource, status: "permission" },
		};
	}

	const entry = statuses[terminalSourceKey];
	const wasAwaitingPermission =
		entry?.workspaceId === workspaceId && entry.status === "permission";
	if (wasAwaitingPermission || targetVisible) {
		return { clearSources: [terminalSource], setStatus: null };
	}

	return {
		clearSources: [],
		setStatus: { source: terminalSource, status: "review" },
	};
}
