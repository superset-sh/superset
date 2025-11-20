import type { Agent, AgentType } from "../../types/process";

/**
 * Default launch commands for each agent type
 */
const DEFAULT_LAUNCH_COMMANDS: Record<AgentType, string> = {
	claude: "claude",
	codex: "codex",
	cursor: "cursor",
};

/**
 * Get launch command for an agent, considering:
 * 1. Agent's stored launchCommand (highest priority)
 * 2. Environment variable override (SUPERSET_AGENT_LAUNCH_<TYPE>)
 * 3. User config file (~/.superset-cli.json)
 * 4. Default for agent type
 */
export function getLaunchCommand(agent: Agent): string | null {
	// 1. Use agent's stored launch command if available
	if (agent.launchCommand) {
		return agent.launchCommand;
	}

	const agentType = agent.agentType;

	// 2. Check environment variable override
	const envKey = `SUPERSET_AGENT_LAUNCH_${agentType.toUpperCase()}`;
	const envOverride = process.env[envKey];
	if (envOverride) {
		return envOverride;
	}

	// 3. Check user config file (TODO: implement config file reading)
	// const userConfig = loadUserConfig();
	// if (userConfig?.launchers?.[agentType]) {
	//   return userConfig.launchers[agentType];
	// }

	// 4. Use default
	return DEFAULT_LAUNCH_COMMANDS[agentType] || null;
}

/**
 * Get the default launch command for an agent type
 * Used when creating new agents
 */
export function getDefaultLaunchCommand(agentType: AgentType): string {
	// Check environment variable override
	const envKey = `SUPERSET_AGENT_LAUNCH_${agentType.toUpperCase()}`;
	const envOverride = process.env[envKey];
	if (envOverride) {
		return envOverride;
	}

	// Return default
	return DEFAULT_LAUNCH_COMMANDS[agentType];
}
