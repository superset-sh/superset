import { joinCommandArgsWithEnv, parseLaunchCommandString } from "./argv";

export interface AgentLaunchConfig {
	id?: string;
	presetId?: string;
	command: string;
	args: string[];
	env?: Record<string, string>;
}

export interface AgentCommandPatch {
	command: string;
	args: string[];
	env: Record<string, string>;
}

interface LinkedPresetLaunch {
	agentId?: string;
	commands: string[];
}

function areEnvMapsEqual(
	left: Record<string, string>,
	right: Record<string, string>,
): boolean {
	const leftEntries = Object.entries(left);
	const rightEntries = Object.entries(right);
	if (leftEntries.length !== rightEntries.length) return false;
	return leftEntries.every(([key, value]) => right[key] === value);
}

export function getAgentCommandText(agent: AgentLaunchConfig): string {
	return joinCommandArgsWithEnv(agent.command, agent.args, agent.env);
}

export function parseAgentCommandText(commandText: string): AgentCommandPatch {
	return parseLaunchCommandString(commandText);
}

export function isAgentCommandPatchChanged(
	agent: AgentLaunchConfig,
	patch: AgentCommandPatch,
): boolean {
	return (
		patch.command !== agent.command ||
		patch.args.length !== agent.args.length ||
		patch.args.some((arg, index) => arg !== agent.args[index]) ||
		!areEnvMapsEqual(patch.env, agent.env ?? {})
	);
}

export function findLinkedAgent<TAgent extends AgentLaunchConfig>(
	agents: readonly TAgent[] | undefined,
	agentId: string | undefined,
): TAgent | null {
	if (!agents || !agentId) return null;
	return (
		agents.find((agent) => agent.id === agentId) ??
		agents.find((agent) => agent.presetId === agentId) ??
		null
	);
}

export function resolvePresetLaunchCommands(
	preset: LinkedPresetLaunch,
	agents: readonly AgentLaunchConfig[] | undefined,
): string[] {
	const linkedAgent = findLinkedAgent(agents, preset.agentId);
	if (linkedAgent?.command.trim()) {
		return [getAgentCommandText(linkedAgent)];
	}
	return preset.commands;
}
