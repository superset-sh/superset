import type { Pane, Tab, WorkspaceState } from "@superset/panes";
import {
	BUILTIN_AGENT_LABELS,
	type BuiltinAgentId,
} from "@superset/shared/agent-catalog";
import type {
	AgentIdentity,
	AgentLifecyclePayload,
} from "@superset/workspace-client";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { V2NotificationTarget } from "./resolveV2NotificationTarget";

interface V2NativeNotificationContentOptions {
	workspaceName: string;
	payload: AgentLifecyclePayload;
	target: V2NotificationTarget;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
	terminalTitle?: string | null;
}

interface ResolvedPaneLocation {
	tab?: Tab<PaneViewerData>;
	pane?: Pane<PaneViewerData>;
}

const PANE_KIND_LABELS: Record<string, string> = {
	browser: "Browser",
	chat: "Chat",
	comment: "Comment",
	devtools: "DevTools",
	diff: "Changes",
	file: "File",
	terminal: "Terminal",
};

export function getV2NativeNotificationContent({
	workspaceName,
	payload,
	target,
	paneLayout,
	terminalTitle,
}: V2NativeNotificationContentOptions): { title: string; body: string } {
	const agentLabel = getAgentLabel(payload.agent);
	const action =
		payload.eventType === "PermissionRequest" ? "Needs Input" : "Complete";
	const workspaceLabel = cleanLabel(workspaceName) ?? "Workspace";
	const location = resolvePaneLocation({ paneLayout, target });
	const paneLabel = getPaneLabel({
		pane: location.pane,
		target,
		terminalTitle,
	});
	const tabLabel = getTabLabel(location.tab, paneLayout);
	const bodyParts = [
		`Workspace: ${workspaceLabel}`,
		`Pane: ${paneLabel}`,
		tabLabel ? `Tab: ${tabLabel}` : null,
	].filter((part): part is string => Boolean(part));

	return {
		title:
			agentLabel === "Agent"
				? `Agent ${action}`
				: `Agent ${action} - ${agentLabel}`,
		body: bodyParts.join(" | "),
	};
}

function getAgentLabel(agent: AgentIdentity | undefined): string {
	const agentId = cleanLabel(agent?.agentId);
	if (!agentId) return "Agent";
	if (agentId in BUILTIN_AGENT_LABELS) {
		return BUILTIN_AGENT_LABELS[agentId as BuiltinAgentId];
	}
	return humanizeIdentifier(agentId);
}

function resolvePaneLocation({
	paneLayout,
	target,
}: {
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
	target: V2NotificationTarget;
}): ResolvedPaneLocation {
	const tab = target.tabId
		? paneLayout?.tabs.find((candidate) => candidate.id === target.tabId)
		: undefined;
	const pane = target.paneId ? tab?.panes[target.paneId] : undefined;
	return { tab, pane };
}

function getPaneLabel({
	pane,
	target,
	terminalTitle,
}: {
	pane: Pane<PaneViewerData> | undefined;
	target: V2NotificationTarget;
	terminalTitle?: string | null;
}): string {
	return (
		cleanLabel(pane?.titleOverride) ??
		cleanLabel(terminalTitle) ??
		(pane ? PANE_KIND_LABELS[pane.kind] : undefined) ??
		`Terminal ${shortId(target.terminalId)}`
	);
}

function getTabLabel(
	tab: Tab<PaneViewerData> | undefined,
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined,
): string | null {
	if (!tab) return null;
	const explicitTitle = cleanLabel(tab.titleOverride);
	if (explicitTitle) return explicitTitle;
	const index = paneLayout?.tabs.indexOf(tab);
	return typeof index === "number" && index >= 0 ? `Tab ${index + 1}` : null;
}

function cleanLabel(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function humanizeIdentifier(value: string): string {
	const words = value
		.replace(/^custom:/, "")
		.split(/[-_:\s]+/)
		.filter(Boolean);
	if (words.length === 0) return "Agent";
	return words
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function shortId(value: string): string {
	const withoutTerminalPrefix = value.replace(/^terminal[-_:]?/i, "");
	const candidate = withoutTerminalPrefix || value;
	return candidate.length > 8 ? candidate.slice(0, 8) : candidate;
}
