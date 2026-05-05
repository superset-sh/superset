import type { PromptTransport } from "./agent-prompt-launch";

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

/**
 * Hardcoded terminal agent presets. Used as the seed list when a host's
 * agent table is empty, and as the install catalog the desktop picker
 * renders. Lives here (not on the host service) because it's static
 * configuration that ships with the binary, not data the API owns.
 *
 * Launch resolution:
 *   prompt
 *     ? [command, ...args, ...promptArgs, ...(promptTransport === "argv" ? [prompt] : [])]
 *     : [command, ...args]
 *
 * `promptArgs` is only included when launching with a prompt — codex's
 * trailing `--`, opencode's `--prompt`, and copilot's `-i` therefore do
 * not appear in promptless launches. Stdin transport pipes the prompt to
 * the spawned process's stdin instead of pushing it to argv.
 *
 * Superset Chat is intentionally excluded — its model/provider config
 * lives in chat settings, not in terminal-agent configs.
 */
export const HOST_AGENT_PRESETS = [
	{
		presetId: "claude",
		label: "Claude",
		description:
			"Anthropic's coding agent for reading code, editing files, and running terminal workflows.",
		command: "claude",
		args: ["--permission-mode", "acceptEdits"],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
	},
	{
		presetId: "amp",
		label: "Amp",
		description:
			"Amp's coding agent for terminal-first coding, subagents, and task work.",
		command: "amp",
		args: [],
		promptTransport: "stdin",
		promptArgs: [],
		env: {},
	},
	{
		presetId: "codex",
		label: "Codex",
		description:
			"OpenAI's coding agent for reading, modifying, and running code across tasks.",
		command: "codex",
		args: [
			"-c",
			'model_reasoning_effort="high"',
			"-c",
			'model_reasoning_summary="detailed"',
			"-c",
			"model_supports_reasoning_summaries=true",
			"--sandbox",
			"workspace-write",
			"--ask-for-approval",
			"never",
		],
		promptTransport: "argv",
		promptArgs: ["--"],
		env: {},
	},
	{
		presetId: "gemini",
		label: "Gemini",
		description:
			"Google's open-source terminal agent for coding, problem-solving, and task work.",
		command: "gemini",
		args: ["--approval-mode=auto_edit"],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
	},
	{
		presetId: "mastracode",
		label: "Mastracode",
		description:
			"Mastra's coding agent for building, debugging, and shipping code from the terminal.",
		command: "mastracode",
		args: [],
		promptTransport: "argv",
		promptArgs: ["--prompt"],
		env: {},
	},
	{
		presetId: "opencode",
		label: "OpenCode",
		description: "Open-source coding agent for the terminal, IDE, and desktop.",
		command: "opencode",
		args: [],
		promptTransport: "argv",
		promptArgs: ["--prompt"],
		env: {},
	},
	{
		presetId: "pi",
		label: "Pi",
		description:
			"Minimal terminal coding harness for flexible coding workflows.",
		command: "pi",
		args: [],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
	},
	{
		presetId: "copilot",
		label: "Copilot",
		description:
			"GitHub's coding agent for planning, editing, and building in your repo.",
		command: "copilot",
		args: ["--allow-tool=write"],
		promptTransport: "argv",
		promptArgs: ["-i"],
		env: {},
	},
	{
		presetId: "cursor-agent",
		label: "Cursor Agent",
		description:
			"Cursor's coding agent for editing, running, and debugging code in parallel.",
		command: "cursor-agent",
		args: [],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
	},
] as const satisfies readonly HostAgentPreset[];

const DEFAULT_PRESET_IDS = new Set([
	"claude",
	"amp",
	"codex",
	"gemini",
	"copilot",
]);

export function getDefaultSeedPresets(): HostAgentPreset[] {
	return HOST_AGENT_PRESETS.filter((preset) =>
		DEFAULT_PRESET_IDS.has(preset.presetId),
	).map((preset) => ({
		...preset,
		args: [...preset.args],
		promptArgs: [...preset.promptArgs],
		env: { ...preset.env },
	}));
}

export function getPresetById(presetId: string): HostAgentPreset | undefined {
	const preset = HOST_AGENT_PRESETS.find((item) => item.presetId === presetId);
	if (!preset) return undefined;
	return {
		...preset,
		args: [...preset.args],
		promptArgs: [...preset.promptArgs],
		env: { ...preset.env },
	};
}
