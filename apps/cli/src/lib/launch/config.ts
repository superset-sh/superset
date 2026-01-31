import type { Agent, AgentType } from "../../types/process";

const DEFAULT_LAUNCH_COMMANDS: Record<AgentType, string> = {
	claude: "claude",
	codex: "codex",
	cursor: "cursor",
};

export function getLaunchCommand(agent: Agent): string | null {
	if (agent.launchCommand) {
		return agent.launchCommand;
	}

	const envKey = `SUPERSET_AGENT_LAUNCH_${agent.agentType.toUpperCase()}`;
	const envOverride = process.env[envKey];
	if (envOverride) {
		return envOverride;
	}

	return DEFAULT_LAUNCH_COMMANDS[agent.agentType] || null;
}

export function getDefaultLaunchCommand(agentType: AgentType): string {
	const envKey = `SUPERSET_AGENT_LAUNCH_${agentType.toUpperCase()}`;
	const envOverride = process.env[envKey];
	if (envOverride) {
		return envOverride;
	}

	return DEFAULT_LAUNCH_COMMANDS[agentType];
}
