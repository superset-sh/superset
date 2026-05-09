import { buildAgentLaunchCommand } from "renderer/lib/agent-launch-command";
import { parseCommandString } from "renderer/lib/argv";

export interface AgentForResolution {
	presetId: string;
	command: string;
	args: string[];
}

export interface PresetForResolution {
	agentId?: string;
	commands: string[];
}

export function buildAgentCommandsByPresetId(
	agents: readonly AgentForResolution[],
): Map<string, string> {
	const map = new Map<string, string>();
	for (const agent of agents) {
		if (agent.command.trim().length === 0) continue;
		if (map.has(agent.presetId)) continue;
		map.set(agent.presetId, buildAgentLaunchCommand(agent));
	}
	return map;
}

/**
 * Resolve the launch commands for a v2 preset, overlaying live agent
 * config from the host service on top of the row's stored snapshot.
 *
 * Resolution order:
 *  1. If `preset.agentId` is set and an installed agent matches by
 *     `presetId`, return its current launch command. This is the path
 *     that lets edits in `Settings → Agents` propagate to existing
 *     presets.
 *  2. If `preset.agentId` is missing (legacy/manually-added rows), try
 *     to infer the linked agent by matching the snapshot's first
 *     command token against an installed agent's `command` (e.g.
 *     "claude"). Built-in agent commands are short, well-known
 *     binaries, so a token match is a strong signal that the row was
 *     seeded from that agent. This recovers the live overlay for rows
 *     that predate the `agentId` field or were created via paths that
 *     never set it.
 *  3. Otherwise fall back to the snapshot `preset.commands`.
 */
export function resolveLivePresetCommands(
	preset: PresetForResolution,
	agents: readonly AgentForResolution[],
	agentCommandsByPresetId?: Map<string, string>,
): string[] {
	const liveByPresetId =
		agentCommandsByPresetId ?? buildAgentCommandsByPresetId(agents);

	if (preset.agentId) {
		const live = liveByPresetId.get(preset.agentId);
		if (live) return [live];
		return preset.commands;
	}

	const first = preset.commands[0];
	if (!first) return preset.commands;
	const { command: token } = parseCommandString(first);
	if (!token) return preset.commands;
	for (const agent of agents) {
		if (agent.command.trim().length === 0) continue;
		if (agent.command === token) {
			return [buildAgentLaunchCommand(agent)];
		}
	}
	return preset.commands;
}
