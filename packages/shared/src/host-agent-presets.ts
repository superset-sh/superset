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
	resumeArgs: string[];
	forkArgs: string[];
	env: Record<string, string>;
}

function tokenize(commandString: string): string[] {
	return commandString.split(/\s+/).filter(Boolean);
}

// The variant commands include the base command; strip the shared prefix to
// get just the variant-only args (e.g. "codex --flag --" → ["--"]).
function deriveSuffixArgs(
	commandTokens: string[],
	variantCommand: string | undefined,
): string[] {
	if (!variantCommand) return [];
	return tokenize(variantCommand).slice(commandTokens.length);
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
 *
 * Resuming a previous session splices `[...resumeArgs, sessionId]` after the
 * base args. Empty `resumeArgs` means the agent has no id-based resume.
 * Forking uses `forkArgs`; `{sessionId}` marks the provider-specific id
 * position, otherwise the id is appended after those args.
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
			promptArgs: deriveSuffixArgs(commandTokens, agent.promptCommand),
			resumeArgs: deriveSuffixArgs(commandTokens, agent.resumeCommand),
			forkArgs: deriveSuffixArgs(commandTokens, agent.forkCommand),
			env: {},
		};
	});

function clonePreset(preset: HostAgentPreset): HostAgentPreset {
	return {
		...preset,
		args: [...preset.args],
		promptArgs: [...preset.promptArgs],
		resumeArgs: [...preset.resumeArgs],
		forkArgs: [...preset.forkArgs],
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
