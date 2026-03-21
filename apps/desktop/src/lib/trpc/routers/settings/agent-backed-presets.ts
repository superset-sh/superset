import type { TerminalPreset } from "@superset/local-db";
import {
	AGENT_PRESET_COMMANDS,
	type AgentType,
} from "@superset/shared/agent-command";
import type { ResolvedAgentConfig } from "shared/utils/agent-settings";
import { getAgentIdFromPresetName } from "./agent-preset-name";

function isDefaultAgentTemplateCommand(
	preset: TerminalPreset,
	agentId: AgentType,
): boolean {
	if (preset.commands.length !== 1) return false;
	const currentCommand = preset.commands[0]?.trim();
	const defaultCommand = (AGENT_PRESET_COMMANDS[agentId][0] ?? "").trim();
	if (!currentCommand || !defaultCommand) return false;
	return currentCommand === defaultCommand;
}

function getAgentCommandByAgentId(
	agentPresets: ResolvedAgentConfig[],
): Map<AgentType, string> {
	const commandByAgentId = new Map<AgentType, string>();

	for (const preset of agentPresets) {
		if (preset.kind !== "terminal") continue;
		const agentId = getAgentIdFromPresetName(preset.id);
		if (!agentId) continue;
		const command = preset.command.trim();
		if (!command) continue;
		commandByAgentId.set(agentId, command);
	}

	return commandByAgentId;
}

/**
 * Keeps built-in agent presets aligned with user agent overrides when terminal
 * presets still contain untouched template commands.
 */
export function hydrateAgentBackedPresetCommands({
	presets,
	agentPresets,
}: {
	presets: TerminalPreset[];
	agentPresets: ResolvedAgentConfig[];
}): TerminalPreset[] {
	if (presets.length === 0 || agentPresets.length === 0) return presets;

	const commandByAgentId = getAgentCommandByAgentId(agentPresets);
	if (commandByAgentId.size === 0) return presets;

	return presets.map((preset) => {
		const agentId = getAgentIdFromPresetName(preset.name);
		if (!agentId) return preset;
		if (!isDefaultAgentTemplateCommand(preset, agentId)) return preset;

		const overrideCommand = commandByAgentId.get(agentId);
		if (!overrideCommand) return preset;
		if (preset.commands[0]?.trim() === overrideCommand) return preset;

		return {
			...preset,
			commands: [overrideCommand],
		};
	});
}
