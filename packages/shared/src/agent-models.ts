/**
 * Curated per-agent model catalogs for the workspace-create model picker.
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
			{ id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
			{ id: "gpt-5.1", label: "GPT-5.1" },
		],
	},
	{
		presetId: "cursor-agent",
		modelFlag: "--model",
		models: [
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
			{ id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
			{ id: "openai/gpt-5", label: "GPT-5" },
		],
	},
	{
		presetId: "superset",
		modelFlag: null,
		models: SUPERSET_CHAT_MODELS.map(({ id, label }) => ({ id, label })),
	},
];

export function getAgentModelSupport(
	presetId: string,
): AgentModelSupport | undefined {
	return AGENT_MODEL_SUPPORT.find((entry) => entry.presetId === presetId);
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
