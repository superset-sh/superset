/**
 * Curated per-agent model and effort catalogs for the workspace-create
 * pickers.
 *
 * Entries are keyed by terminal-agent presetId (see
 * `builtin-terminal-agents.ts`) plus the virtual `"superset"` chat agent.
 * Agents absent from this list don't support model selection and render no
 * picker. Model ids are the exact values the CLI accepts after `modelFlag`
 * (opencode requires `provider/model`, so the provider is baked into the id);
 * for `"superset"` the id is passed as chat-session metadata instead and
 * `modelFlag` is null.
 *
 * The lists are hand-maintained and expected to drift with CLI releases —
 * update them here when a tool adds or retires models.
 */

export interface AgentModelOption {
	id: string;
	label: string;
}

export interface AgentModelSupport {
	presetId: string;
	modelFlag: string | null;
	/**
	 * Env var that carries the model when the CLI has no model flag (e.g. Vibe's
	 * `VIBE_ACTIVE_MODEL`). Mutually exclusive with `modelFlag` in practice.
	 */
	modelEnv?: string;
	models: AgentModelOption[];
}

export interface SupersetChatModel extends AgentModelOption {
	provider: string;
}

/**
 * Canonical model catalog for the Superset chat agent. This is the single
 * source of truth — `tRPC chat.getModels` re-shapes it for its API and the
 * `"superset"` entry in `AGENT_MODEL_SUPPORT` reuses it for the picker. Keep
 * model edits here so the two never drift.
 */
export const SUPERSET_CHAT_MODELS: readonly SupersetChatModel[] = [
	{ id: "anthropic/claude-opus-4-8", label: "Opus 4.8", provider: "Anthropic" },
	{ id: "anthropic/claude-opus-4-7", label: "Opus 4.7", provider: "Anthropic" },
	{ id: "anthropic/claude-fable-5", label: "Fable 5", provider: "Anthropic" },
	{
		id: "anthropic/claude-sonnet-4-6",
		label: "Sonnet 4.6",
		provider: "Anthropic",
	},
	{
		id: "anthropic/claude-haiku-4-5",
		label: "Haiku 4.5",
		provider: "Anthropic",
	},
	{ id: "openai/gpt-5.5", label: "GPT-5.5", provider: "OpenAI" },
	{ id: "openai/gpt-5.4", label: "GPT-5.4", provider: "OpenAI" },
	{ id: "openai/gpt-5.3-codex", label: "GPT-5.3 Codex", provider: "OpenAI" },
];

export const AGENT_MODEL_SUPPORT: readonly AgentModelSupport[] = [
	{
		presetId: "claude",
		modelFlag: "--model",
		models: [
			{ id: "fable", label: "Fable" },
			{ id: "opus", label: "Opus" },
			{ id: "sonnet", label: "Sonnet" },
			{ id: "haiku", label: "Haiku" },
		],
	},
	{
		presetId: "codex",
		modelFlag: "--model",
		models: [
			{ id: "gpt-5.5", label: "GPT-5.5" },
			{ id: "gpt-5.4", label: "GPT-5.4" },
			{ id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
		],
	},
	{
		presetId: "gemini",
		modelFlag: "--model",
		models: [
			{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
			{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
		],
	},
	{
		presetId: "copilot",
		modelFlag: "--model",
		models: [
			{ id: "claude-fable-5", label: "Claude Fable 5" },
			{ id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
			{ id: "gpt-5.1", label: "GPT-5.1" },
		],
	},
	{
		presetId: "cursor-agent",
		modelFlag: "--model",
		models: [
			// cursor-agent has no effort flag, so Fable's thinking level is
			// baked into the model id (`--list-models` exposes high and xhigh).
			{ id: "claude-fable-5-thinking-high", label: "Fable 5" },
			{ id: "claude-fable-5-thinking-xhigh", label: "Fable 5 xHigh" },
			{ id: "opus", label: "Opus" },
			{ id: "sonnet-4.5", label: "Sonnet 4.5" },
			{ id: "gpt-5", label: "GPT-5" },
			{ id: "composer-1", label: "Composer 1" },
		],
	},
	{
		presetId: "opencode",
		modelFlag: "--model",
		models: [
			{ id: "anthropic/claude-fable-5", label: "Claude Fable 5" },
			{ id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
			{ id: "openai/gpt-5", label: "GPT-5" },
		],
	},
	{
		presetId: "vibe",
		modelFlag: null,
		modelEnv: "VIBE_ACTIVE_MODEL",
		models: [
			{ id: "mistral-medium-3.5", label: "Mistral Medium 3.5" },
			{ id: "devstral-small", label: "Devstral Small" },
		],
	},
	{
		presetId: "superset",
		modelFlag: null,
		models: SUPERSET_CHAT_MODELS.map(({ id, label }) => ({ id, label })),
	},
];

export interface AgentEffortSupport {
	presetId: string;
	effortFlag: string;
	/**
	 * Prepended to the selected effort id to form the flag's value token.
	 * Codex has no dedicated effort flag, so effort rides a config override:
	 * `-c model_reasoning_effort=high`.
	 */
	effortValuePrefix?: string;
	efforts: AgentModelOption[];
}

/**
 * Curated per-agent reasoning-effort catalogs, mirroring
 * `AGENT_MODEL_SUPPORT`. Flags and accepted values were verified against each
 * CLI's `--help` (or its own validator) — agents absent from this list
 * (gemini, opencode, cursor-agent, droid, superset chat) expose no effort
 * control on their interactive launch command.
 */
export const AGENT_EFFORT_SUPPORT: readonly AgentEffortSupport[] = [
	{
		presetId: "claude",
		effortFlag: "--effort",
		efforts: [
			{ id: "low", label: "Low" },
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
			{ id: "xhigh", label: "xHigh" },
			{ id: "max", label: "Max" },
		],
	},
	{
		presetId: "amp",
		effortFlag: "--effort",
		efforts: [
			{ id: "none", label: "None" },
			{ id: "minimal", label: "Minimal" },
			{ id: "low", label: "Low" },
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
			{ id: "xhigh", label: "xHigh" },
			{ id: "max", label: "Max" },
		],
	},
	{
		presetId: "codex",
		effortFlag: "-c",
		effortValuePrefix: "model_reasoning_effort=",
		efforts: [
			{ id: "low", label: "Low" },
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
			{ id: "xhigh", label: "xHigh" },
		],
	},
	{
		presetId: "mastracode",
		effortFlag: "--thinking-level",
		efforts: [
			{ id: "off", label: "Off" },
			{ id: "low", label: "Low" },
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
			{ id: "xhigh", label: "xHigh" },
		],
	},
	{
		presetId: "pi",
		effortFlag: "--thinking",
		efforts: [
			{ id: "off", label: "Off" },
			{ id: "minimal", label: "Minimal" },
			{ id: "low", label: "Low" },
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
			{ id: "xhigh", label: "xHigh" },
		],
	},
	{
		presetId: "copilot",
		effortFlag: "--effort",
		efforts: [
			{ id: "low", label: "Low" },
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
			{ id: "xhigh", label: "xHigh" },
		],
	},
];

export function getAgentModelSupport(
	presetId: string,
): AgentModelSupport | undefined {
	return AGENT_MODEL_SUPPORT.find((entry) => entry.presetId === presetId);
}

export function getAgentEffortSupport(
	presetId: string,
): AgentEffortSupport | undefined {
	return AGENT_EFFORT_SUPPORT.find((entry) => entry.presetId === presetId);
}

/**
 * Argv tokens that select `effort` for the given preset, e.g.
 * `["--effort", "high"]` (codex: `["-c", "model_reasoning_effort=high"]`).
 * Same degrade-to-default contract as `buildAgentModelArgs`: unknown presets
 * or effort ids outside the curated list return `[]`.
 */
export function buildAgentEffortArgs(
	presetId: string,
	effort: string | undefined,
): string[] {
	if (!effort) return [];
	const support = getAgentEffortSupport(presetId);
	if (!support) return [];
	if (!support.efforts.some((option) => option.id === effort)) return [];
	return [support.effortFlag, `${support.effortValuePrefix ?? ""}${effort}`];
}

/**
 * Argv tokens that select `model` for the given preset, e.g.
 * `["--model", "sonnet"]`. Returns `[]` for unknown presets, presets without
 * a CLI flag (superset chat), an unset model, or a model id that isn't in
 * the preset's curated list — callers can spread the result unconditionally
 * and a stale or arbitrary model id degrades to the CLI default instead of
 * a broken launch.
 */
export function buildAgentModelArgs(
	presetId: string,
	model: string | undefined,
): string[] {
	if (!model) return [];
	const support = getAgentModelSupport(presetId);
	if (!support?.modelFlag) return [];
	if (!support.models.some((option) => option.id === model)) return [];
	return [support.modelFlag, model];
}

/**
 * Env vars that select `model` for env-based agents (Vibe has no `--model`
 * flag; the model rides `VIBE_ACTIVE_MODEL`). Same degrade-to-default contract
 * as `buildAgentModelArgs`: unknown presets, presets without `modelEnv`, an
 * unset model, or a model id outside the curated list return `{}`.
 */
export function buildAgentModelEnv(
	presetId: string,
	model: string | undefined,
): Record<string, string> {
	if (!model) return {};
	const support = getAgentModelSupport(presetId);
	if (!support?.modelEnv) return {};
	if (!support.models.some((option) => option.id === model)) return {};
	return { [support.modelEnv]: model };
}
