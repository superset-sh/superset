import type { WorkspaceState } from "@superset/panes";
import type { AgentLifecyclePayload } from "@superset/workspace-client";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";

export interface V2NotificationTarget {
	workspaceId: string;
	tabId?: string;
	paneId?: string;
	sourceId: string | null;
	terminalId?: string;
	chatSessionId?: string;
}

export function firstNonBlank(
	...values: (string | undefined | null)[]
): string | null {
	for (const value of values) {
		if (value && value.trim().length > 0) return value;
	}
	return null;
}

export function getNotificationSourceId(
	payload: Pick<
		AgentLifecyclePayload,
		"paneId" | "terminalId" | "sessionId" | "hookSessionId" | "resourceId"
	>,
): string | null {
	return firstNonBlank(
		payload.terminalId,
		payload.sessionId,
		payload.hookSessionId,
		payload.resourceId,
		payload.paneId,
	);
}

export function getNotificationSourceIds(
	payload: Pick<
		AgentLifecyclePayload,
		"paneId" | "terminalId" | "sessionId" | "hookSessionId" | "resourceId"
	>,
): string[] {
	const ids = new Set<string>();
	for (const value of [
		payload.terminalId,
		payload.sessionId,
		payload.hookSessionId,
		payload.resourceId,
		payload.paneId,
	]) {
		const id = firstNonBlank(value);
		if (id) ids.add(id);
	}
	return [...ids];
}

export function resolveV2NotificationTarget({
	workspaceId,
	payload,
	paneLayout,
}: {
	workspaceId: string;
	payload: AgentLifecyclePayload;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
}): V2NotificationTarget {
	const sourceId = getNotificationSourceId(payload);
	const tabId = firstNonBlank(payload.tabId);
	const paneId = firstNonBlank(payload.paneId);
	const terminalId = firstNonBlank(payload.terminalId);
	if (tabId && paneId) {
		return {
			workspaceId,
			tabId,
			paneId,
			sourceId,
			terminalId: terminalId ?? undefined,
			chatSessionId: getChatSessionId(payload) ?? undefined,
		};
	}

	const terminalTarget = terminalId
		? resolveTerminalTarget({
				workspaceId,
				terminalId,
				paneLayout,
				sourceId,
			})
		: null;
	if (terminalTarget) return terminalTarget;

	const chatSessionId = getChatSessionId(payload);
	if (chatSessionId) {
		const chatTarget = resolveChatTarget({
			workspaceId,
			chatSessionId,
			paneLayout,
			sourceId,
		});
		if (chatTarget) return chatTarget;
	}

	return {
		workspaceId,
		sourceId,
		terminalId: terminalId ?? undefined,
		chatSessionId: chatSessionId ?? undefined,
	};
}

export function resolveTerminalTarget({
	workspaceId,
	terminalId,
	paneLayout,
	sourceId = terminalId,
}: {
	workspaceId: string;
	terminalId: string;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
	sourceId?: string | null;
}): V2NotificationTarget | null {
	if (!paneLayout?.tabs) return null;

	for (const tab of paneLayout.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "terminal") continue;
			const data = pane.data as Partial<TerminalPaneData>;
			if (data.terminalId !== terminalId) continue;
			return {
				workspaceId,
				tabId: tab.id,
				paneId: pane.id,
				sourceId,
				terminalId,
			};
		}
	}

	return null;
}

export function isV2NotificationTargetVisible({
	currentWorkspaceId,
	paneLayout,
	target,
}: {
	currentWorkspaceId: string | null;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
	target: V2NotificationTarget;
}): boolean {
	if (!currentWorkspaceId || currentWorkspaceId !== target.workspaceId) {
		return false;
	}
	if (!target.tabId || !target.paneId || !paneLayout?.tabs) return false;

	const tab = paneLayout.tabs.find(
		(candidate) => candidate.id === target.tabId,
	);
	return (
		tab?.activePaneId === target.paneId && paneLayout.activeTabId === tab.id
	);
}

function resolveChatTarget({
	workspaceId,
	chatSessionId,
	paneLayout,
	sourceId,
}: {
	workspaceId: string;
	chatSessionId: string;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
	sourceId: string | null;
}): V2NotificationTarget | null {
	if (!paneLayout?.tabs) return null;

	for (const tab of paneLayout.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "chat") continue;
			const data = pane.data as Partial<ChatPaneData>;
			if (data.sessionId !== chatSessionId) continue;
			return {
				workspaceId,
				tabId: tab.id,
				paneId: pane.id,
				sourceId,
				chatSessionId,
			};
		}
	}

	return null;
}

function getChatSessionId(
	payload: Pick<
		AgentLifecyclePayload,
		"sessionId" | "hookSessionId" | "resourceId"
	>,
): string | null {
	return firstNonBlank(
		payload.sessionId,
		payload.hookSessionId,
		payload.resourceId,
	);
}
