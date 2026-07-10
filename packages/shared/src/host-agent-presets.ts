import type { PromptTransport } from "./agent-prompt-launch";
import { BUILTIN_TERMINAL_AGENTS } from "./builtin-terminal-agents";

export interface HostAgentPreset {
	presetId: string;
	label: string;
	description: string;
	command: string;
	args: string[];
	promptTransport: PromptTransport;
	promptArgs: string[];
	env: Record<string, string>;
}

function tokenize(commandString: string): string[] {
	return commandString.split(/\s+/).filter(Boolean);
}

function derivePromptArgs(
	commandTokens: string[],
	promptCommand: string | undefined,
): string[] {
	if (!promptCommand) return [];
	// promptCommand includes the base command; strip the shared prefix to
	// get just the prompt-only args (e.g. "codex --flag --" → ["--"]).
	return tokenize(promptCommand).slice(commandTokens.length);
}

/**
 * Terminal agent presets derived from `BUILTIN_TERMINAL_AGENTS`. Used as
 * the seed list when a host's agent table is empty and as the install
 * catalog the desktop picker renders.
 *
 * Launch resolution:
 *   prompt
 *     ? [command, ...args, ...promptArgs, ...(promptTransport === "argv" ? [prompt] : [])]
 *     : [command, ...args]
 *
 * Stdin transport pipes the prompt to stdin instead of pushing it to argv.
 */
export const HOST_AGENT_PRESETS: readonly HostAgentPreset[] =
	BUILTIN_TERMINAL_AGENTS.map((agent) => {
		const commandTokens = tokenize(agent.command);
		const [bin = agent.id, ...args] = commandTokens;
		return {
			presetId: agent.id,
			label: agent.label,
			description: agent.description,
			command: bin,
			args,
			promptTransport: agent.promptTransport ?? "argv",
			promptArgs: derivePromptArgs(commandTokens, agent.promptCommand),
			env: {},
		};
	});

function clonePreset(preset: HostAgentPreset): HostAgentPreset {
	return {
		...preset,
		args: [...preset.args],
		promptArgs: [...preset.promptArgs],
		env: { ...preset.env },
	};
}

export function getDefaultSeedPresets(): HostAgentPreset[] {
	return HOST_AGENT_PRESETS.map(clonePreset);
}

export function getPresetById(presetId: string): HostAgentPreset | undefined {
	const preset = HOST_AGENT_PRESETS.find((item) => item.presetId === presetId);
	return preset ? clonePreset(preset) : undefined;
}
