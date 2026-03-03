import {
	AGENT_LABELS,
	AGENT_TYPES,
	type AgentType,
} from "@superset/shared/agent-command";

export const SUPERSET_CHAT_AGENT = "superset" as const;

export type WorkspaceAgentType = AgentType | typeof SUPERSET_CHAT_AGENT;

export const WORKSPACE_AGENT_TYPES: readonly WorkspaceAgentType[] = [
	...AGENT_TYPES,
	SUPERSET_CHAT_AGENT,
];

export const WORKSPACE_AGENT_LABELS: Record<WorkspaceAgentType, string> = {
	...AGENT_LABELS,
	[SUPERSET_CHAT_AGENT]: "Superset",
};

const TERMINAL_AGENT_SET = new Set<string>(AGENT_TYPES);
const WORKSPACE_AGENT_SET = new Set<string>(WORKSPACE_AGENT_TYPES);

export function isWorkspaceAgentType(
	value: string,
): value is WorkspaceAgentType {
	return WORKSPACE_AGENT_SET.has(value);
}

export function isTerminalAgentType(
	value: WorkspaceAgentType,
): value is AgentType {
	return TERMINAL_AGENT_SET.has(value);
}
