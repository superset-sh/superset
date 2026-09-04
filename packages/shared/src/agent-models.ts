/**
 * Curated per-agent model, effort, and launch-mode catalogs for the
 * workspace-create pickers.
 *
 * Entries are keyed by terminal-agent presetId (see
 * `builtin-terminal-agents.ts`). Agents absent from this list don't support
 * model selection and render no picker. Model ids are the exact values the CLI
 * accepts after `modelFlag` (opencode requires `provider/model`, so the
 * provider is baked into the id).
 * The virtual `omp` preset is resolved from the configured executable so OMP
 * options never leak onto the legacy `pi` CLI.
 *
 * The lists are hand-maintained and expected to drift with CLI releases —
 * update them here when a tool adds or retires models.
 */

export interface AgentModelOption {
	id: string;
	label: string;
	/**
	 * Optional section header this option sits under in the picker. Options
	 * without one render flat, so a catalog only pays for grouping when its
	 * list has more than one kind of entry in it.
	 */
	group?: string;
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
 * Canonical model catalog served by the cloud `tRPC chat.getModels`.
 */
export const SUPERSET_CHAT_MODELS: readonly SupersetChatModel[] = [
	{ id: "anthropic/claude-opus-5", label: "Opus 5", provider: "Anthropic" },
	{ id: "anthropic/claude-opus-4-8", label: "Opus 4.8", provider: "Anthropic" },
	{ id: "anthropic/claude-opus-4-7", label: "Opus 4.7", provider: "Anthropic" },
	{
		id: "anthropic/claude-fable-5-1",
		label: "Fable 5.1",
		provider: "Anthropic",
	},
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
	{ id: "openai/gpt-6-astra", label: "GPT-6 Astra", provider: "OpenAI" },
	{ id: "openai/gpt-5.6-sol", label: "GPT-5.6 Sol", provider: "OpenAI" },
	{
		id: "openai/gpt-5.6-terra",
		label: "GPT-5.6 Terra",
		provider: "OpenAI",
	},
	{ id: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna", provider: "OpenAI" },
	{ id: "openai/gpt-5.5", label: "GPT-5.5", provider: "OpenAI" },
	// Retiring from Codex on 2026-08-31; prefer the GPT-5.6 models above.
	{ id: "openai/gpt-5.4", label: "GPT-5.4", provider: "OpenAI" },
	{ id: "openai/gpt-5.3-codex", label: "GPT-5.3 Codex", provider: "OpenAI" },
];

const LATEST_GROUP = "Latest";
const PINNED_GROUP = "Pinned releases";
const CURSOR_ANTHROPIC_GROUP = "Anthropic";
const CURSOR_OPENAI_GROUP = "OpenAI";
const CURSOR_OTHER_GROUP = "Other";
const CURRENT_GROUP = "Current";
const CODEX_RETIRING_GROUP = "Retiring 2026-08-31";

export const AGENT_MODEL_SUPPORT: readonly AgentModelSupport[] = [
	{
		presetId: "claude",
		modelFlag: "--model",
		models: [
			// Aliases track whatever the CLI considers newest in each family;
			// the pinned ids stay on one model release, which is what teams
			// standardising on a known model need. The group headers carry
			// that distinction so the labels don't have to.
			{ id: "fable", label: "Fable", group: LATEST_GROUP },
			{ id: "opus", label: "Opus", group: LATEST_GROUP },
			{ id: "sonnet", label: "Sonnet", group: LATEST_GROUP },
			{ id: "haiku", label: "Haiku", group: LATEST_GROUP },
			{ id: "claude-fable-5-1", label: "Fable 5.1", group: PINNED_GROUP },
			{ id: "claude-fable-5", label: "Fable 5", group: PINNED_GROUP },
			{ id: "claude-opus-5", label: "Opus 5", group: PINNED_GROUP },
			{ id: "claude-sonnet-5", label: "Sonnet 5", group: PINNED_GROUP },
			{ id: "claude-opus-4-8", label: "Opus 4.8", group: PINNED_GROUP },
			{ id: "claude-opus-4-7", label: "Opus 4.7", group: PINNED_GROUP },
			{ id: "claude-opus-4-6", label: "Opus 4.6", group: PINNED_GROUP },
			{ id: "claude-opus-4-5", label: "Opus 4.5", group: PINNED_GROUP },
			{ id: "claude-sonnet-4-6", label: "Sonnet 4.6", group: PINNED_GROUP },
			{ id: "claude-haiku-4-5", label: "Haiku 4.5", group: PINNED_GROUP },
		],
	},
	{
		presetId: "codex",
		modelFlag: "--model",
		models: [
			// GPT-6 Astra is the slug Codex's model docs publish (2026-09-03) and
			// the API's only GPT-6 id. OpenAI is enabling it account by account,
			// so it shows up in a login's live catalog (`codex app-server` →
			// `model/list`) only once that account has access.
			{ id: "gpt-6-astra", label: "GPT-6 Astra", group: CURRENT_GROUP },
			{ id: "gpt-5.6-sol", label: "GPT-5.6 Sol", group: CURRENT_GROUP },
			{ id: "gpt-5.6-terra", label: "GPT-5.6 Terra", group: CURRENT_GROUP },
			{ id: "gpt-5.6-luna", label: "GPT-5.6 Luna", group: CURRENT_GROUP },
			{ id: "gpt-5.5", label: "GPT-5.5", group: CURRENT_GROUP },
			// Superseded by gpt-5.6-terra/luna; the header dates the retirement
			// so it reaches the person picking rather than only this file.
			{ id: "gpt-5.4", label: "GPT-5.4", group: CODEX_RETIRING_GROUP },
			{
				id: "gpt-5.3-codex",
				label: "GPT-5.3 Codex",
				group: CODEX_RETIRING_GROUP,
			},
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
			// cursor-agent has no effort flag: every effort level is its own
			// model id, and these are each family's default level. The effort
			// picker swaps in the sibling id (`CURSOR_EFFORT_VARIANTS`). Ids
			// verified against a live account's `--list-models` (2026-09-04);
			// the list is account-dependent and unknown ids are rejected by
			// the CLI, not silently ignored. "auto" is the only id free-plan
			// accounts can use (besides composer) — named models fail there
			// with "Named models unavailable", so keep an explicit working
			// choice in the picker.
			{ id: "auto", label: "Auto" },
			{ id: "composer-2.5", label: "Composer 2.5" },
			{
				id: "claude-fable-5-1-thinking-high",
				label: "Fable 5.1",
				group: CURSOR_ANTHROPIC_GROUP,
			},
			{
				id: "claude-fable-5-thinking-high",
				label: "Fable 5",
				group: CURSOR_ANTHROPIC_GROUP,
			},
			{
				id: "claude-opus-5-high",
				label: "Opus 5",
				group: CURSOR_ANTHROPIC_GROUP,
			},
			{
				id: "claude-sonnet-5-thinking-high",
				label: "Sonnet 5",
				group: CURSOR_ANTHROPIC_GROUP,
			},
			{
				id: "claude-opus-4-8-high",
				label: "Opus 4.8",
				group: CURSOR_ANTHROPIC_GROUP,
			},
			{
				id: "claude-opus-4-7-xhigh",
				label: "Opus 4.7",
				group: CURSOR_ANTHROPIC_GROUP,
			},
			{
				id: "claude-4.6-sonnet-medium",
				label: "Sonnet 4.6",
				group: CURSOR_ANTHROPIC_GROUP,
			},
			{
				id: "gpt-5.6-sol-medium",
				label: "GPT-5.6 Sol",
				group: CURSOR_OPENAI_GROUP,
			},
			{
				id: "gpt-5.6-terra-medium",
				label: "GPT-5.6 Terra",
				group: CURSOR_OPENAI_GROUP,
			},
			{
				id: "gpt-5.6-luna-medium",
				label: "GPT-5.6 Luna",
				group: CURSOR_OPENAI_GROUP,
			},
			{ id: "gpt-5.5-medium", label: "GPT-5.5", group: CURSOR_OPENAI_GROUP },
			{ id: "gpt-5.4-medium", label: "GPT-5.4", group: CURSOR_OPENAI_GROUP },
			{ id: "gpt-5.3-codex", label: "Codex 5.3", group: CURSOR_OPENAI_GROUP },
			{
				id: "gemini-3.8-flash-high",
				label: "Gemini 3.8 Flash",
				group: CURSOR_OTHER_GROUP,
			},
			{
				id: "cursor-grok-4.6-high",
				label: "Grok 4.6",
				group: CURSOR_OTHER_GROUP,
			},
			{ id: "kimi-k3-max", label: "Kimi K3", group: CURSOR_OTHER_GROUP },
			{ id: "glm-5.2-high", label: "GLM 5.2", group: CURSOR_OTHER_GROUP },
		],
	},
	{
		presetId: "opencode",
		modelFlag: "--model",
		models: [
			// openai ids verified against `opencode models` (2026-08-05), which
			// no longer lists the old `openai/gpt-5`. anthropic ids follow the
			// same models.dev catalog but need an authed anthropic provider to
			// appear in that listing; `claude-fable-5-1` was checked against
			// models.dev directly (2026-09-01).
			{ id: "anthropic/claude-opus-5", label: "Claude Opus 5" },
			{ id: "anthropic/claude-fable-5-1", label: "Claude Fable 5.1" },
			{ id: "anthropic/claude-fable-5", label: "Claude Fable 5" },
			{ id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
			{ id: "openai/gpt-5.6-sol", label: "GPT-5.6 Sol" },
			{ id: "openai/gpt-5.6-terra", label: "GPT-5.6 Terra" },
			{ id: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna" },
		],
	},
	{
		presetId: "omp",
		modelFlag: "--model",
		models: [
			// OMP accepts configured role aliases as well as exact
			// provider/model selectors. Exact ids verified against
			// `omp models --json` in OMP 18.0.1; `claude-fable-5-1` against the
			// catalog bundled in OMP 18.1.2.
			{ id: "@smol", label: "Configured fast model" },
			{ id: "@slow", label: "Configured slow model" },
			{ id: "@plan", label: "Configured plan model" },
			{ id: "anthropic/claude-opus-5", label: "Claude Opus 5" },
			{ id: "anthropic/claude-fable-5-1", label: "Claude Fable 5.1" },
			{ id: "anthropic/claude-fable-5", label: "Claude Fable 5" },
			{
				id: "anthropic/claude-sonnet-4-6",
				label: "Claude Sonnet 4.6",
			},
			{ id: "openai-codex/gpt-5.6-sol", label: "GPT-5.6 Sol" },
			{ id: "openai-codex/gpt-5.6-terra", label: "GPT-5.6 Terra" },
			{ id: "openai-codex/gpt-5.6-luna", label: "GPT-5.6 Luna" },
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
		// Polygraph's picker selects the harness it launches, not a model: the
		// selection rides `polygraph session start --agent <id>`. The launch
		// plumbing is flag-agnostic, so it reuses this catalog. Unset
		// ("Default") omits the flag and polygraph falls back to its own
		// `--agent auto` resolution.
		presetId: "polygraph",
		modelFlag: "--agent",
		models: [
			{ id: "claude", label: "Claude" },
			{ id: "codex", label: "Codex" },
			{ id: "opencode", label: "OpenCode" },
		],
	},
];

export interface AgentEffortOption extends AgentModelOption {
	/**
	 * Model ids that accept this effort, when only some do. Absent means every
	 * model the agent offers takes it. Codex's two top levels arrived with
	 * GPT-5.6 and the models below it reject them, so the picker only offers
	 * them next to a model that has them.
	 */
	models?: readonly string[];
}

export interface AgentEffortSupport {
	presetId: string;
	/**
	 * Flag that carries the effort. `null` when the CLI has none and effort
	 * instead selects a sibling model id via `modelVariants`.
	 */
	effortFlag: string | null;
	/**
	 * Prepended to the selected effort id to form the flag's value token.
	 * Codex has no dedicated effort flag, so effort rides a config override:
	 * `-c model_reasoning_effort=high`.
	 */
	effortValuePrefix?: string;
	efforts: AgentEffortOption[];
	/**
	 * Curated model id → effort id → model id to launch instead. cursor-agent
	 * publishes one model id per effort level (`claude-opus-4-8-low`), so the
	 * effort rewrites the `--model` token and only models with a ladder here
	 * offer an effort at all.
	 */
	modelVariants?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface AgentModeOption extends AgentModelOption {
	/** Exact argv tokens appended when this mode is selected. */
	args: string[];
}

export interface AgentModeSupport {
	presetId: string;
	modes: AgentModeOption[];
}

/**
 * cursor-agent model ids for each effort level of one family. Every level is
 * `<family>-<level>` except where `overrides` says otherwise (Codex 5.3's
 * medium is the bare `gpt-5.3-codex`). Verified against `--list-models`
 * (cursor-agent 2026.08.11); the CLI's bracket override syntax
 * (`model[effort=high]`) is rejected by its model validator, so sibling ids
 * are the only route.
 */
function cursorEffortVariants(
	family: string,
	levels: readonly string[],
	overrides: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
	return Object.fromEntries(
		levels.map((level) => [level, overrides[level] ?? `${family}-${level}`]),
	);
}

const CURSOR_CLAUDE_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
const CURSOR_GPT_LEVELS = [
	"none",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;

const CURSOR_EFFORT_VARIANTS: Readonly<
	Record<string, Readonly<Record<string, string>>>
> = {
	"claude-fable-5-1-thinking-high": cursorEffortVariants(
		"claude-fable-5-1-thinking",
		CURSOR_CLAUDE_LEVELS,
	),
	"claude-fable-5-thinking-high": cursorEffortVariants(
		"claude-fable-5-thinking",
		CURSOR_CLAUDE_LEVELS,
	),
	// Opus 5 without thinking only goes up to high; xhigh and max exist on
	// its thinking sibling, which is a different model in Cursor's catalog.
	"claude-opus-5-high": cursorEffortVariants("claude-opus-5", [
		"low",
		"medium",
		"high",
	]),
	"claude-sonnet-5-thinking-high": cursorEffortVariants(
		"claude-sonnet-5-thinking",
		CURSOR_CLAUDE_LEVELS,
	),
	"claude-opus-4-8-high": cursorEffortVariants(
		"claude-opus-4-8",
		CURSOR_CLAUDE_LEVELS,
	),
	"claude-opus-4-7-xhigh": cursorEffortVariants(
		"claude-opus-4-7",
		CURSOR_CLAUDE_LEVELS,
	),
	"gpt-5.6-sol-medium": cursorEffortVariants("gpt-5.6-sol", CURSOR_GPT_LEVELS),
	"gpt-5.6-terra-medium": cursorEffortVariants(
		"gpt-5.6-terra",
		CURSOR_GPT_LEVELS,
	),
	"gpt-5.6-luna-medium": cursorEffortVariants(
		"gpt-5.6-luna",
		CURSOR_GPT_LEVELS,
	),
	// GPT-5.5 spells its top level out ("extra-high") where every other
	// family uses "xhigh".
	"gpt-5.5-medium": cursorEffortVariants(
		"gpt-5.5",
		["none", "low", "medium", "high", "xhigh"],
		{ xhigh: "gpt-5.5-extra-high" },
	),
	"gpt-5.4-medium": cursorEffortVariants("gpt-5.4", [
		"low",
		"medium",
		"high",
		"xhigh",
	]),
	"gpt-5.3-codex": cursorEffortVariants(
		"gpt-5.3-codex",
		["low", "medium", "high", "xhigh"],
		{ medium: "gpt-5.3-codex" },
	),
	"gemini-3.8-flash-high": cursorEffortVariants("gemini-3.8-flash", [
		"low",
		"medium",
		"high",
	]),
	"cursor-grok-4.6-high": cursorEffortVariants("cursor-grok-4.6", [
		"low",
		"medium",
		"high",
		"xhigh",
	]),
	"kimi-k3-max": cursorEffortVariants("kimi-k3", ["low", "high", "max"]),
	"glm-5.2-high": cursorEffortVariants("glm-5.2", ["high", "max"]),
};

const PI_THINKING_LEVELS: AgentModelOption[] = [
	{ id: "off", label: "Off" },
	{ id: "minimal", label: "Minimal" },
	{ id: "low", label: "Low" },
	{ id: "medium", label: "Medium" },
	{ id: "high", label: "High" },
	{ id: "xhigh", label: "xHigh" },
];

/**
 * Curated per-agent reasoning-effort catalogs, mirroring
 * `AGENT_MODEL_SUPPORT`. Flags and accepted values were verified against each
 * CLI's `--help` (or its own validator) — agents absent from this list
 * (gemini, opencode, droid, superset chat) expose no effort control on their
 * interactive launch command.
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
			// Per-model support taken from Codex's own model catalog
			// (`supported_reasoning_levels`, codex-cli 0.149.1): every GPT-5.6
			// model takes `max`, and `ultra` — max reasoning plus automatic
			// task delegation — is Sol and Terra only. GPT-6 Astra documents
			// `max` (API `reasoning.effort`); `ultra` stays off until its live
			// catalog entry confirms it.
			{
				id: "max",
				label: "Max",
				models: ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"],
			},
			{ id: "ultra", label: "Ultra", models: ["gpt-5.6-sol", "gpt-5.6-terra"] },
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
		efforts: [...PI_THINKING_LEVELS],
	},
	{
		presetId: "omp",
		effortFlag: "--thinking",
		efforts: [...PI_THINKING_LEVELS],
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
	{
		presetId: "cursor-agent",
		effortFlag: null,
		efforts: [
			{ id: "none", label: "None" },
			{ id: "low", label: "Low" },
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
			{ id: "xhigh", label: "xHigh" },
			{ id: "max", label: "Max" },
		],
		modelVariants: CURSOR_EFFORT_VARIANTS,
	},
];

/**
 * Optional launch modes that change how an agent starts. An unset mode always
 * delegates to the CLI default.
 */
export const AGENT_MODE_SUPPORT: readonly AgentModeSupport[] = [
	{
		presetId: "omp",
		modes: [{ id: "plan", label: "Plan first", args: ["--plan-yolo"] }],
	},
];

/**
 * Existing Superset profiles can use Pi's preset/icon with an overridden OMP
 * executable. Resolve capabilities from that executable so legacy Pi keeps its
 * own launch surface while `omp` and absolute OMP paths get OMP controls.
 */
export function resolveAgentLaunchPresetId(
	presetId: string,
	command: string,
): string {
	const [commandToken = ""] = command.trim().split(/\s+/);
	const commandParts = commandToken.split(/[\\/]/);
	const executable = (
		commandParts[commandParts.length - 1] ?? ""
	).toLowerCase();
	return executable === "omp" || executable === "omp.exe" ? "omp" : presetId;
}

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

export function getAgentModeSupport(
	presetId: string,
): AgentModeSupport | undefined {
	return AGENT_MODE_SUPPORT.find((entry) => entry.presetId === presetId);
}

/**
 * Efforts the given preset offers for `model` — the full curated list minus
 * any option the selected model rejects. An unset model (or an id outside the
 * curated catalog, which `buildAgentModelArgs` drops so the launch runs the
 * agent's own default) keeps the full list. Presets whose effort is a sibling
 * model id (`modelVariants`) offer only that model's ladder, and nothing when
 * the model is unset or has no ladder.
 */
export function getAgentEfforts(
	presetId: string,
	model?: string,
): AgentEffortOption[] {
	const support = getAgentEffortSupport(presetId);
	if (!support) return [];
	const selected = getAgentModelSupport(presetId)?.models.some(
		(option) => option.id === model,
	)
		? model
		: undefined;
	if (support.modelVariants) {
		const variants = selected ? support.modelVariants[selected] : undefined;
		if (!variants) return [];
		return support.efforts.filter((effort) => effort.id in variants);
	}
	return support.efforts.filter(
		(effort) => !effort.models || !selected || effort.models.includes(selected),
	);
}

/**
 * Argv tokens that select `effort` for the given preset, e.g.
 * `["--effort", "high"]` (codex: `["-c", "model_reasoning_effort=high"]`).
 * Same degrade-to-default contract as `buildAgentModelArgs`: unknown presets,
 * effort ids outside the curated list, and efforts the selected model rejects
 * return `[]`. Presets without an effort flag (cursor-agent) also return `[]`:
 * their effort already rode the `--model` token from `buildAgentModelArgs`.
 */
export function buildAgentEffortArgs(
	presetId: string,
	effort: string | undefined,
	model?: string,
): string[] {
	if (!effort) return [];
	const support = getAgentEffortSupport(presetId);
	if (!support?.effortFlag) return [];
	const efforts = getAgentEfforts(presetId, model);
	if (!efforts.some((option) => option.id === effort)) return [];
	return [support.effortFlag, `${support.effortValuePrefix ?? ""}${effort}`];
}

/**
 * Argv tokens that select a launch mode for the given preset. Unknown presets,
 * unset modes, and stale mode ids degrade to the CLI default.
 */
export function buildAgentModeArgs(
	presetId: string,
	mode: string | undefined,
): string[] {
	if (!mode) return [];
	const support = getAgentModeSupport(presetId);
	const option = support?.modes.find((candidate) => candidate.id === mode);
	return option ? [...option.args] : [];
}

/**
 * Whether `model` is an id the preset's launch accepts: a curated picker entry
 * or, for presets whose effort is a sibling model id, any of those siblings.
 * That keeps a preference saved before a sibling was folded into its family
 * (cursor-agent's old "Fable 5 xHigh" entry) launching, and lets CLI callers
 * pass any level id directly.
 */
export function isCuratedAgentModel(presetId: string, model: string): boolean {
	const support = getAgentModelSupport(presetId);
	if (!support) return false;
	if (support.models.some((option) => option.id === model)) return true;
	const variants = getAgentEffortSupport(presetId)?.modelVariants;
	if (!variants) return false;
	return Object.values(variants).some((ladder) =>
		Object.values(ladder).includes(model),
	);
}

/**
 * Argv tokens that select `model` for the given preset, e.g.
 * `["--model", "sonnet"]`. Returns `[]` for unknown presets, presets without
 * a CLI flag (superset chat), an unset model, or a model id that isn't in
 * the preset's curated list — callers can spread the result unconditionally
 * and a stale or arbitrary model id degrades to the CLI default instead of
 * a broken launch. When the preset's effort is a sibling model id
 * (cursor-agent), a curated `effort` swaps that id in; an effort the model
 * has no ladder for launches the model's default level.
 */
export function buildAgentModelArgs(
	presetId: string,
	model: string | undefined,
	effort?: string,
): string[] {
	if (!model) return [];
	const support = getAgentModelSupport(presetId);
	if (!support?.modelFlag) return [];
	if (!isCuratedAgentModel(presetId, model)) return [];
	const variant = effort
		? getAgentEffortSupport(presetId)?.modelVariants?.[model]?.[effort]
		: undefined;
	return [support.modelFlag, variant ?? model];
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
