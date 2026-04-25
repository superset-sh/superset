import type { WorkspaceState } from "@superset/panes";
import type { AgentLifecyclePayload } from "@superset/workspace-client";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

export interface V2NotificationTarget {
	workspaceId: string;
	tabId?: string;
	paneId?: string;
	terminalId: string;
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
	return (
		resolveTerminalTarget({
			workspaceId,
			terminalId: payload.terminalId,
			paneLayout,
		}) ?? {
			workspaceId,
			terminalId: payload.terminalId,
		}
	);
}

export function resolveTerminalTarget({
	workspaceId,
	terminalId,
	paneLayout,
}: {
	workspaceId: string;
	terminalId: string;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
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
