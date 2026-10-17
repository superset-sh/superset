import type { PromptTransport } from "./agent-prompt-launch";
import { BUILTIN_TERMINAL_AGENTS } from "./builtin-terminal-agents";
import { FEATURE_FLAGS } from "./constants";

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

/**
 * Split a launch line into `[binary, ...args]`. Whitespace is the only
 * separator — there is no quoting, so an arg containing a space has to be
 * passed structurally rather than through a launch string.
 */
export function tokenizeAgentCommand(commandString: string): string[] {
	return commandString.split(/\s+/).filter(Boolean);
}

// The variant commands include the base command; strip the shared prefix to
// get just the variant-only args (e.g. "codex --flag --" → ["--"]).
function deriveSuffixArgs(
	commandTokens: string[],
	variantCommand: string | undefined,
): string[] {
	if (!variantCommand) return [];
	return tokenizeAgentCommand(variantCommand).slice(commandTokens.length);
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
		const commandTokens = tokenizeAgentCommand(agent.command);
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

/**
 * Presets shown only to users with the flag on. Hosts cannot read flags, so
 * these are never seeded, and clients hide their rows while the flag is off.
 */
export const AGENT_PRESET_FEATURE_FLAGS: ReadonlyMap<string, string> = new Map([
	["pdev", FEATURE_FLAGS.PDEV_AGENT],
]);

export function isAgentPresetEnabled(
	presetId: string,
	activeFeatureFlags: readonly string[],
): boolean {
	const flag = AGENT_PRESET_FEATURE_FLAGS.get(presetId);
	return flag === undefined || activeFeatureFlags.includes(flag);
}

export function getDefaultSeedPresets(): HostAgentPreset[] {
	return HOST_AGENT_PRESETS.filter(
		(preset) => !AGENT_PRESET_FEATURE_FLAGS.has(preset.presetId),
	).map(clonePreset);
}

export function getPresetById(presetId: string): HostAgentPreset | undefined {
	const preset = HOST_AGENT_PRESETS.find((item) => item.presetId === presetId);
	return preset ? clonePreset(preset) : undefined;
}
