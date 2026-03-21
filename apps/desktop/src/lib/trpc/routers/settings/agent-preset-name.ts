import { AGENT_TYPES, type AgentType } from "@superset/shared/agent-command";

const AGENT_ID_BY_PRESET_NAME = new Map(
	AGENT_TYPES.map((agentId) => [agentId, agentId]),
);

export function getAgentIdFromPresetName(name: string): AgentType | null {
	const normalizedName = name.trim().toLowerCase();
	if (!normalizedName) return null;
	return AGENT_ID_BY_PRESET_NAME.get(normalizedName as AgentType) ?? null;
}
