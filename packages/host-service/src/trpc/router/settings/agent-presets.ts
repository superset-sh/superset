export type PromptTransport = "argv" | "stdin";

export interface AgentPreset {
	presetId: string;
	label: string;
	command: string;
	args: string[];
	promptTransport: PromptTransport;
	promptArgs: string[];
	env: Record<string, string>;
}

/**
 * Hardcoded terminal agent presets. Used as add templates and as the seed
 * for first `list()` / `resetToDefaults()`.
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
export const AGENT_PRESETS = [
	{
		presetId: "claude",
		label: "Claude",
		command: "claude",
		args: ["--permission-mode", "acceptEdits"],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
	},
	{
		presetId: "amp",
		label: "Amp",
		command: "amp",
		args: [],
		promptTransport: "stdin",
		promptArgs: [],
		env: {},
	},
	{
		presetId: "codex",
		label: "Codex",
		command: "codex",
		args: [
			"-c",
			'model_reasoning_effort="high"',
			"-c",
			'model_reasoning_summary="detailed"',
			"-c",
			"model_supports_reasoning_summaries=true",
			"--full-auto",
		],
		promptTransport: "argv",
		promptArgs: ["--"],
		env: {},
	},
	{
		presetId: "gemini",
		label: "Gemini",
		command: "gemini",
		args: ["--approval-mode=auto_edit"],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
	},
	{
		presetId: "opencode",
		label: "OpenCode",
		command: "opencode",
		args: [],
		promptTransport: "argv",
		promptArgs: ["--prompt"],
		env: {},
	},
	{
		presetId: "pi",
		label: "Pi",
		command: "pi",
		args: [],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
	},
	{
		presetId: "copilot",
		label: "Copilot",
		command: "copilot",
		args: ["--allow-tool=write"],
		promptTransport: "argv",
		promptArgs: ["-i"],
		env: {},
	},
	{
		presetId: "cursor-agent",
		label: "Cursor Agent",
		command: "cursor-agent",
		args: [],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
	},
] as const satisfies readonly AgentPreset[];

const DEFAULT_PRESET_IDS = new Set([
	"claude",
	"amp",
	"codex",
	"gemini",
	"copilot",
]);

export function getDefaultSeedPresets(): AgentPreset[] {
	return AGENT_PRESETS.filter((preset) =>
		DEFAULT_PRESET_IDS.has(preset.presetId),
	).map((preset) => ({
		...preset,
		args: [...preset.args],
		promptArgs: [...preset.promptArgs],
		env: { ...preset.env },
	}));
}

export function getPresetById(presetId: string): AgentPreset | undefined {
	const preset = AGENT_PRESETS.find((item) => item.presetId === presetId);
	if (!preset) return undefined;
	return {
		...preset,
		args: [...preset.args],
		promptArgs: [...preset.promptArgs],
		env: { ...preset.env },
	};
}
