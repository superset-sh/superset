import type { TerminalPreset } from "@superset/local-db";
import type { AgentType } from "@superset/shared/agent-command";
import type { ResolvedAgentConfig } from "shared/utils/agent-settings";
import { derivePromptCommandFromCommand } from "shared/utils/terminal-agent-command";
import { getAgentIdFromPresetName } from "./agent-preset-name";

function getTerminalPresetCommandByAgentId(
	presets: TerminalPreset[],
): Map<AgentType, string> {
	const commandByAgentId = new Map<AgentType, string>();

	for (const preset of presets) {
		const agentId = getAgentIdFromPresetName(preset.name);
		if (!agentId) continue;
		const command = preset.commands[0]?.trim();
		if (!command) continue;
		// Keep the first matching preset command to preserve user order semantics.
		if (!commandByAgentId.has(agentId)) {
			commandByAgentId.set(agentId, command);
		}
	}

	return commandByAgentId;
}

/**
 * Aligns launch-time terminal agent configs with terminal presets when command
 * wasn't explicitly overridden in Agent Settings.
 */
export function hydrateAgentPresetsFromTerminalPresets({
	agentPresets,
	terminalPresets,
}: {
	agentPresets: ResolvedAgentConfig[];
	terminalPresets: TerminalPreset[];
}): ResolvedAgentConfig[] {
	if (agentPresets.length === 0 || terminalPresets.length === 0) {
		return agentPresets;
	}

	const commandByAgentId = getTerminalPresetCommandByAgentId(terminalPresets);
	if (commandByAgentId.size === 0) return agentPresets;

	return agentPresets.map((preset) => {
		if (preset.kind !== "terminal") return preset;
		if (preset.overriddenFields.includes("command")) return preset;

		const nextCommand = commandByAgentId.get(preset.id as AgentType);
		if (!nextCommand || nextCommand === preset.command.trim()) return preset;

		const nextPromptCommand = preset.overriddenFields.includes("promptCommand")
			? preset.promptCommand
			: (derivePromptCommandFromCommand({
					command: nextCommand,
					baseCommand: preset.command,
					basePromptCommand: preset.promptCommand,
				}) ?? preset.promptCommand);

		return {
			...preset,
			command: nextCommand,
			promptCommand: nextPromptCommand,
		};
	});
}
