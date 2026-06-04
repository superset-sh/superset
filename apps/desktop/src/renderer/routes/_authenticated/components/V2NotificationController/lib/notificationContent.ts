import {
	BUILTIN_AGENT_LABELS,
	type BuiltinAgentId,
} from "@superset/shared/agent-catalog";
import type {
	AgentIdentity,
	AgentLifecyclePayload,
} from "@superset/workspace-client";

interface V2NativeNotificationContentOptions {
	workspaceName: string;
	payload: AgentLifecyclePayload;
}

export function getV2NativeNotificationContent({
	workspaceName,
	payload,
}: V2NativeNotificationContentOptions): { title: string; body: string } {
	const agentLabel = getAgentLabel(payload.agent);
	const action =
		payload.eventType === "PermissionRequest" ? "Needs Attention" : "Complete";
	const workspaceLabel = cleanLabel(workspaceName) ?? "Workspace";

	return {
		title: `${agentLabel} - ${action}`,
		body: workspaceLabel,
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
