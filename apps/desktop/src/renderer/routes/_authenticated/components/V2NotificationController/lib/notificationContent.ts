import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import {
	AGENT_IDENTITY_LABELS,
	type AgentIdentityId,
} from "@superset/shared/agent-catalog";
import type {
	AgentIdentity,
	AgentLifecyclePayload,
} from "@superset/workspace-client";

import stripAnsi from "strip-ansi";

interface V2NativeNotificationContentOptions {
	workspaceName: string;
	projectName?: string;
	payload: AgentLifecyclePayload;
}

export function getV2NativeNotificationContent({
	workspaceName,
	projectName,
	payload,
}: V2NativeNotificationContentOptions): {
	title: string;
	subtitle: string;
	body: string;
} {
	const agentLabel = getAgentLabel(payload.agent);
	const action =
		payload.eventType === "PermissionRequest"
			? i18n._(msg({ message: "Needs attention" }))
			: payload.eventType === "Failed"
				? i18n._(msg({ message: "Failed" }))
				: i18n._(msg({ message: "Finished" }));
	const workspaceLabel =
		cleanLabel(workspaceName) ?? i18n._(msg({ message: "Workspace" }));

	const projectLabel = cleanLabel(projectName);
	return {
		title: projectLabel
			? `${projectLabel} › ${workspaceLabel}`
			: workspaceLabel,
		subtitle: `${agentLabel} · ${action}`,
		body:
			cleanPreview(payload.preview) ??
			i18n._(msg({ message: "Open workspace" })),
	};
}

function getAgentLabel(agent: AgentIdentity | undefined): string {
	const agentId = cleanLabel(agent?.agentId);
	if (!agentId) return i18n._(msg({ message: "Agent" }));
	if (agentId in AGENT_IDENTITY_LABELS) {
		return AGENT_IDENTITY_LABELS[agentId as AgentIdentityId];
	}
	return humanizeIdentifier(agentId);
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
	if (words.length === 0) return i18n._(msg({ message: "Agent" }));
	return words
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function cleanPreview(value: string | undefined): string | null {
	if (!value) return null;
	const text = stripAnsi(value)
		.replace(/```[^\n]*\n?/g, "")
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^[ \t]*(?:#{1,6} |>[ \t]?|[-*+] |\d+\. )/gm, "")
		.replace(/[*`~]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	const characters = Array.from(text);
	return text
		? characters.length > 180
			? `${characters.slice(0, 179).join("").trimEnd()}…`
			: text
		: null;
}
