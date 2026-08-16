/**
 * Curated per-agent model and effort catalogs for the workspace-create
 * pickers.
 *
 * Entries are keyed by terminal-agent presetId (see
 * `builtin-terminal-agents.ts`). Agents absent from this list don't support
 * model selection and render no picker. Model ids are the exact values the CLI
 * accepts after `modelFlag` (opencode requires `provider/model`, so the
 * provider is baked into the id).
 *
 * The lists are hand-maintained and expected to drift with CLI releases —
 * update them here when a tool adds or retires models.
 */

export interface AgentModelOption {
	id: string;
	label: string;
	provider?: string;
}

/**
 * Structured dimensions for an exact runtime model id. Some CLIs, notably
 * Cursor, encode launch traits into the model id instead of accepting
 * independent flags. Keeping the exact id alongside these dimensions lets the
 * UI present compact pickers without synthesizing unsupported combinations.
 */
export interface AgentRuntimeModelVariant {
	familyId: string;
	familyLabel: string;
	effort: string;
	speed: "standard" | "fast";
	mode: "standard" | "thinking";
	contextWindow: "default" | "1m";
}

export type AgentCapabilityTrait<TOption> =
	| { state: "unknown" }
	| { state: "unsupported" }
	| {
			state: "supported";
			options: TOption[];
			defaultId?: string;
	  };

export interface AgentModelSupport {
	presetId: string;
	modelFlag: string | null;
	/** Model selected when the picker intentionally has no synthetic default. */
	defaultModelId?: string;
	/**
	 * Env var that carries the model when the CLI has no model flag (e.g. Vibe's
	 * `VIBE_ACTIVE_MODEL`). Mutually exclusive with `modelFlag` in practice.
	 */
	modelEnv?: string;
	models: AgentModelOption[];
	/** Maps previously persisted exact runtime ids to their current UI family. */
	modelAliases?: Readonly<Record<string, string>>;
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

export const AGENT_MODEL_SUPPORT: readonly AgentModelSupport[] = [
	{
		presetId: "claude",
		modelFlag: "--model",
		defaultModelId: "claude-fable-5",
		models: [
			{ id: "claude-fable-5", label: "Fable 5" },
			{ id: "claude-opus-5", label: "Opus 5" },
			{ id: "claude-sonnet-5", label: "Sonnet 5" },
			{ id: "claude-opus-4-8", label: "Opus 4.8" },
			{ id: "claude-opus-4-7", label: "Opus 4.7" },
			{ id: "claude-opus-4-6", label: "Opus 4.6" },
			{ id: "claude-opus-4-5", label: "Opus 4.5" },
			{ id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
			{ id: "claude-haiku-4-5", label: "Haiku 4.5" },
		],
	},
	{
		presetId: "codex",
		modelFlag: "--model",
		defaultModelId: "gpt-5.6-sol",
		models: [
			{ id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
			{ id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
			{ id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
			{ id: "gpt-5.5", label: "GPT-5.5" },
			// Retiring from Codex on 2026-08-31; superseded by gpt-5.6-terra/luna.
			{ id: "gpt-5.4", label: "GPT-5.4" },
			{ id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
		],
	},
	{
		presetId: "gemini",
		modelFlag: "--model",
		models: [
			{ id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
			{ id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
			{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
			{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
			{ id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
		],
	},
	{ presetId: "antigravity", modelFlag: "--model", models: [] },
	{
		presetId: "copilot",
		modelFlag: "--model",
		models: [
			{ id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
			{ id: "gpt-5.4", label: "GPT-5.4" },
			{ id: "claude-haiku-4.5", label: "Claude Haiku 4.5" },
			{ id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
			{ id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
			{ id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
			{ id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
			{ id: "mai-code-1-flash", label: "MAI-Code-1 Flash" },
		],
	},
	{
		presetId: "cursor-agent",
		modelFlag: "--model",
		models: [
			// cursor-agent has no effort flag, so effort/thinking levels are
			// baked into the model ids. Ids verified against a live account's
			// `--list-models` (2026-08-05); the list is account-dependent and
			// unknown ids are rejected by the CLI, not silently ignored.
			// "auto" is the only id free-plan accounts can use (besides
			// composer) — named models fail there with "Named models
			// unavailable", so keep an explicit working choice in the picker.
			{ id: "auto", label: "Auto" },
			{ id: "claude-fable-5-thinking-high", label: "Fable 5" },
			{ id: "claude-fable-5-thinking-xhigh", label: "Fable 5 xHigh" },
			{ id: "claude-opus-5-high", label: "Opus 5" },
			{ id: "claude-opus-4-8-high", label: "Opus 4.8" },
			{ id: "claude-4.6-sonnet-medium", label: "Sonnet 4.6" },
			{ id: "gpt-5.6-sol-medium", label: "GPT-5.6 Sol" },
			{ id: "gpt-5.6-terra-medium", label: "GPT-5.6 Terra" },
			{ id: "gpt-5.6-luna-medium", label: "GPT-5.6 Luna" },
			{ id: "gpt-5.3-codex", label: "Codex 5.3" },
			{ id: "composer-2.5", label: "Composer 2.5" },
		],
	},
	{
		presetId: "opencode",
		modelFlag: "--model",
		models: [
			// openai ids verified against `opencode models` (2026-08-05), which
			// no longer lists the old `openai/gpt-5`. anthropic ids follow the
			// same models.dev catalog but need an authed anthropic provider to
			// appear in that listing.
			{
				id: "anthropic/claude-opus-5",
				label: "Claude Opus 5",
				provider: "Anthropic",
			},
			{
				id: "anthropic/claude-fable-5",
				label: "Claude Fable 5",
				provider: "Anthropic",
			},
			{
				id: "anthropic/claude-sonnet-4-5",
				label: "Claude Sonnet 4.5",
				provider: "Anthropic",
			},
			{ id: "openai/gpt-5.6-sol", label: "GPT-5.6 Sol", provider: "OpenAI" },
			{
				id: "openai/gpt-5.6-terra",
				label: "GPT-5.6 Terra",
				provider: "OpenAI",
			},
			{
				id: "openai/gpt-5.6-luna",
				label: "GPT-5.6 Luna",
				provider: "OpenAI",
			},
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
	{ presetId: "pi", modelFlag: "--model", models: [] },
	{ presetId: "grok", modelFlag: "--model", models: [] },
	{ presetId: "kimi", modelFlag: "--model", models: [] },
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

export interface AgentEffortSupport {
	presetId: string;
	label?: string;
	effortFlag: string;
	/** Agent/model default. It is displayed without requiring an override flag. */
	defaultEffortId?: string;
	/**
	 * Prepended to the selected effort id to form the flag's value token.
	 * Codex has no dedicated effort flag, so effort rides a config override:
	 * `-c model_reasoning_effort=high`.
	 */
	effortValuePrefix?: string;
	efforts: AgentModelOption[];
	modelProfiles?: Readonly<
		Record<
			string,
			{
				defaultEffortId: string;
				label?: string;
				efforts: readonly AgentModelOption[];
			}
		>
	>;
}

export interface AgentRuntimeEffortProfile {
	defaultEffortId?: string;
	efforts: readonly AgentModelOption[];
}

export interface AgentModeOption extends AgentModelOption {
	/** Exact argv tokens appended when this mode is selected. */
	args: readonly string[];
}

export interface AgentModeSupport {
	presetId: string;
	label: string;
	defaultModeId?: string;
	modes: readonly AgentModeOption[];
}

export interface AgentSpeedOption extends AgentModelOption {
	/** Exact argv tokens appended when this speed is selected. */
	args: readonly string[];
}

export interface AgentSpeedSupport {
	presetId: string;
	label: string;
	defaultSpeedId?: string;
	supportedModelIds?: readonly string[];
	speeds: AgentSpeedOption[];
}

export interface AgentContextWindowSupport {
	presetId: string;
	defaultContextWindowId: string;
	contextWindows: AgentModelOption[];
}

interface AgentContextWindowEnv {
	CLAUDE_CODE_DISABLE_1M_CONTEXT?: "0" | "1";
}

function createClaudeContextWindowSupport(
	defaultContextWindowId: "200k" | "1m",
): AgentContextWindowSupport {
	return {
		presetId: "claude",
		defaultContextWindowId,
		contextWindows: [
			{ id: "200k", label: "200k" },
			{ id: "1m", label: "1M" },
		],
	};
}

const LOW_TO_MAX_EFFORTS: readonly AgentModelOption[] = [
	{ id: "low", label: "Low" },
	{ id: "medium", label: "Medium" },
	{ id: "high", label: "High" },
	{ id: "xhigh", label: "Extra High" },
	{ id: "max", label: "Max" },
];

const LOW_TO_MAX_WITH_ADVANCED_EFFORTS: readonly AgentModelOption[] = [
	...LOW_TO_MAX_EFFORTS,
	{ id: "ultracode", label: "Ultracode" },
];

const LOW_TO_HIGH_WITH_MAX_EFFORTS: readonly AgentModelOption[] = [
	{ id: "low", label: "Low" },
	{ id: "medium", label: "Medium" },
	{ id: "high", label: "High" },
	{ id: "max", label: "Max" },
];

const CODEX_STANDARD_EFFORTS: readonly AgentModelOption[] = [
	{ id: "low", label: "Low" },
	{ id: "medium", label: "Medium" },
	{ id: "high", label: "High" },
	{ id: "xhigh", label: "Extra High" },
];

const CODEX_MAX_EFFORTS: readonly AgentModelOption[] = [
	...CODEX_STANDARD_EFFORTS,
	{ id: "max", label: "Max" },
];

const CODEX_ULTRA_EFFORTS: readonly AgentModelOption[] = [
	...CODEX_MAX_EFFORTS,
	{ id: "ultra", label: "Ultra" },
];

/**
 * Curated per-agent reasoning-effort catalogs, mirroring
 * `AGENT_MODEL_SUPPORT`. Flags and accepted values were verified against each
 * CLI's `--help` (or its own validator) — agents absent from this list
 * (gemini, opencode, cursor-agent, droid, superset chat) expose no effort
 * control on their interactive launch command.
 */
export const AGENT_EFFORT_SUPPORT: readonly AgentEffortSupport[] = [
	{
		presetId: "antigravity",
		effortFlag: "--effort",
		defaultEffortId: "high",
		efforts: [
			{ id: "low", label: "Low" },
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
		],
	},
	{
		presetId: "opencode",
		effortFlag: "--variant",
		label: "Reasoning",
		efforts: [
			{ id: "none", label: "None" },
			{ id: "low", label: "Low" },
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
			{ id: "xhigh", label: "Extra High" },
			{ id: "max", label: "Max" },
		],
	},
	{
		presetId: "claude",
		effortFlag: "--effort",
		label: "Reasoning",
		efforts: [...LOW_TO_MAX_WITH_ADVANCED_EFFORTS],
		modelProfiles: {
			"claude-fable-5": {
				defaultEffortId: "high",
				efforts: LOW_TO_MAX_WITH_ADVANCED_EFFORTS,
			},
			"claude-opus-5": {
				defaultEffortId: "high",
				efforts: LOW_TO_MAX_WITH_ADVANCED_EFFORTS,
			},
			"claude-sonnet-5": {
				defaultEffortId: "high",
				efforts: LOW_TO_MAX_EFFORTS,
			},
			"claude-opus-4-8": {
				defaultEffortId: "high",
				efforts: LOW_TO_MAX_WITH_ADVANCED_EFFORTS,
			},
			"claude-opus-4-7": {
				defaultEffortId: "xhigh",
				efforts: LOW_TO_MAX_EFFORTS,
			},
			"claude-opus-4-6": {
				defaultEffortId: "high",
				efforts: LOW_TO_HIGH_WITH_MAX_EFFORTS,
			},
			"claude-opus-4-5": {
				defaultEffortId: "high",
				efforts: LOW_TO_HIGH_WITH_MAX_EFFORTS,
			},
			"claude-sonnet-4-6": {
				defaultEffortId: "high",
				efforts: LOW_TO_HIGH_WITH_MAX_EFFORTS,
			},
			"claude-haiku-4-5": {
				defaultEffortId: "off",
				label: "Thinking",
				efforts: [
					{ id: "off", label: "Off" },
					{ id: "on", label: "On" },
				],
			},
		},
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
		defaultEffortId: "low",
		efforts: [...CODEX_ULTRA_EFFORTS],
		modelProfiles: {
			"gpt-5.6-sol": {
				defaultEffortId: "low",
				efforts: CODEX_ULTRA_EFFORTS,
			},
			"gpt-5.6-terra": {
				defaultEffortId: "medium",
				efforts: CODEX_ULTRA_EFFORTS,
			},
			"gpt-5.6-luna": {
				defaultEffortId: "medium",
				efforts: CODEX_MAX_EFFORTS,
			},
			"gpt-5.5": {
				defaultEffortId: "medium",
				efforts: CODEX_STANDARD_EFFORTS,
			},
			"gpt-5.4": {
				defaultEffortId: "medium",
				efforts: CODEX_STANDARD_EFFORTS,
			},
		},
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

/** Launch-time performance choices that are independent from reasoning. */
export const AGENT_SPEED_SUPPORT: readonly AgentSpeedSupport[] = [
	{
		presetId: "codex",
		label: "Service Tier",
		defaultSpeedId: "standard",
		supportedModelIds: [
			"gpt-5.6-sol",
			"gpt-5.6-terra",
			"gpt-5.6-luna",
			"gpt-5.5",
			"gpt-5.4",
		],
		speeds: [
			{
				id: "standard",
				label: "Standard",
				args: ["--disable", "fast_mode"],
			},
			{ id: "fast", label: "Fast", args: ["--enable", "fast_mode"] },
		],
	},
	{
		presetId: "claude",
		label: "Fast Mode",
		defaultSpeedId: "standard",
		supportedModelIds: [
			"claude-opus-5",
			"claude-opus-4-8",
			"claude-opus-4-7",
			"claude-opus-4-6",
			"claude-opus-4-5",
		],
		speeds: [
			{
				id: "standard",
				label: "Off",
				args: ["--settings", '{"fastMode":false}'],
			},
			{
				id: "fast",
				label: "On",
				args: ["--settings", '{"fastMode":true}'],
			},
		],
	},
];

/** Agent personas that are independent from model reasoning. */
export const AGENT_MODE_SUPPORT: readonly AgentModeSupport[] = [
	{
		presetId: "opencode",
		label: "Agent",
		defaultModeId: "build",
		modes: [
			{ id: "build", label: "Build", args: ["--agent", "build"] },
			{ id: "plan", label: "Plan", args: ["--agent", "plan"] },
		],
	},
];

const AGENT_CONTEXT_WINDOW_SUPPORT: Readonly<
	Record<string, AgentContextWindowSupport>
> = {
	"claude:claude-fable-5": createClaudeContextWindowSupport("1m"),
	"claude:claude-opus-5": createClaudeContextWindowSupport("1m"),
	"claude:claude-opus-4-6": createClaudeContextWindowSupport("1m"),
	"claude:claude-sonnet-5": createClaudeContextWindowSupport("200k"),
	"claude:claude-sonnet-4-6": createClaudeContextWindowSupport("200k"),
};

function normalizeAgentEffort(
	presetId: string,
	model: string | undefined,
	effort: string,
): string {
	if (presetId === "claude" && effort === "ultracode") return "xhigh";
	if (
		presetId === "claude" &&
		model === "claude-opus-4-7" &&
		effort === "xhigh"
	) {
		return "max";
	}
	if (
		presetId === "claude" &&
		model === "claude-sonnet-4-6" &&
		effort === "max"
	) {
		return "high";
	}
	return effort;
}

export function getAgentModelSupport(
	presetId: string,
): AgentModelSupport | undefined {
	return AGENT_MODEL_SUPPORT.find((entry) => entry.presetId === presetId);
}

export function getAgentEffortSupport(
	presetId: string,
	model?: string | null,
): AgentEffortSupport | undefined {
	const support = AGENT_EFFORT_SUPPORT.find(
		(entry) => entry.presetId === presetId,
	);
	if (!support?.modelProfiles) return support;
	if (!model) return support;
	const profile = support.modelProfiles[model];
	if (!profile) return undefined;
	return {
		...support,
		defaultEffortId: profile.defaultEffortId,
		label: profile.label ?? support.label,
		efforts: [...profile.efforts],
	};
}

export function resolveAgentEffortSupport(
	presetId: string,
	model: string | null | undefined,
	reasoning: AgentCapabilityTrait<AgentModelOption> | undefined,
): AgentEffortSupport | undefined {
	const staticSupport = getAgentEffortSupport(presetId, model);
	if (!reasoning || reasoning.state === "unknown") return staticSupport;
	if (reasoning.state === "unsupported") return undefined;
	const transport = AGENT_EFFORT_SUPPORT.find(
		(entry) => entry.presetId === presetId,
	);
	if (!transport) return undefined;
	return reasoning.options.length > 0
		? {
				...transport,
				defaultEffortId: reasoning.defaultId,
				efforts: [...reasoning.options],
			}
		: undefined;
}

export function getAgentSpeedSupport(
	presetId: string,
	model?: string | null,
): AgentSpeedSupport | undefined {
	const support = AGENT_SPEED_SUPPORT.find(
		(entry) => entry.presetId === presetId,
	);
	if (!support) return undefined;
	if (
		support.supportedModelIds &&
		(!model || !support.supportedModelIds.includes(model))
	) {
		return undefined;
	}
	return support;
}

export function getAgentModeSupport(
	presetId: string,
): AgentModeSupport | undefined {
	return AGENT_MODE_SUPPORT.find((entry) => entry.presetId === presetId);
}

export function getAgentContextWindowSupport(
	presetId: string,
	model?: string | null,
): AgentContextWindowSupport | undefined {
	if (!model) return undefined;
	return AGENT_CONTEXT_WINDOW_SUPPORT[`${presetId}:${model}`];
}

export function buildAgentSpeedArgs(
	presetId: string,
	speed: string | undefined,
	model?: string,
): string[] {
	if (!speed) return [];
	const support = getAgentSpeedSupport(presetId, model);
	const option = support?.speeds.find((candidate) => candidate.id === speed);
	return option ? [...option.args] : [];
}

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
 * Argv tokens that select `effort` for the given preset, e.g.
 * `["--effort", "high"]` (codex: `["-c", "model_reasoning_effort=high"]`).
 * Same degrade-to-default contract as `buildAgentModelArgs`: unknown presets
 * or effort ids outside the curated list return `[]`.
 */
export function buildAgentEffortArgs(
	presetId: string,
	effort: string | undefined,
	model?: string,
	runtimeProfile?: AgentRuntimeEffortProfile,
): string[] {
	if (!effort) return [];
	const transport = runtimeProfile
		? AGENT_EFFORT_SUPPORT.find((entry) => entry.presetId === presetId)
		: getAgentEffortSupport(presetId, model);
	const support =
		transport && runtimeProfile
			? { ...transport, efforts: [...runtimeProfile.efforts] }
			: transport;
	if (!support) return [];
	if (!support.efforts.some((option) => option.id === effort)) return [];
	if (presetId === "claude" && model === "claude-haiku-4-5") return [];
	const normalizedEffort = normalizeAgentEffort(presetId, model, effort);
	return [
		support.effortFlag,
		`${support.effortValuePrefix ?? ""}${normalizedEffort}`,
	];
}

interface AgentRuntimeTraits {
	model?: string;
	effort?: string;
	speed?: string;
}

/** Claude settings must be emitted once because repeated flags do not compose. */
export function buildAgentRuntimeTraitArgs(
	presetId: string,
	traits: AgentRuntimeTraits,
): string[] {
	if (presetId !== "claude") {
		return buildAgentSpeedArgs(presetId, traits.speed, traits.model);
	}

	const settings: Record<string, boolean> = {};
	const speedSupport = getAgentSpeedSupport(presetId, traits.model);
	if (
		traits.speed &&
		speedSupport?.speeds.some((option) => option.id === traits.speed)
	) {
		settings.fastMode = traits.speed === "fast";
	}

	const effortSupport = getAgentEffortSupport(presetId, traits.model);
	const effortSupported = effortSupport?.efforts.some(
		(option) => option.id === traits.effort,
	);
	if (effortSupported && traits.effort === "ultracode") {
		settings.ultracode = true;
	}
	if (
		effortSupported &&
		traits.model === "claude-haiku-4-5" &&
		(traits.effort === "on" || traits.effort === "off")
	) {
		settings.alwaysThinkingEnabled = traits.effort === "on";
	}

	return Object.keys(settings).length > 0
		? ["--settings", JSON.stringify(settings)]
		: [];
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
	contextWindow?: string,
	runtimeModelIds?: readonly string[],
): string[] {
	if (!model) return [];
	const support = getAgentModelSupport(presetId);
	if (!support?.modelFlag) return [];
	const allowedModelIds =
		runtimeModelIds ?? support.models.map((option) => option.id);
	if (!allowedModelIds.includes(model)) return [];
	const contextSupport = getAgentContextWindowSupport(presetId, model);
	const resolvedModel =
		contextSupport?.contextWindows.some(
			(option) => option.id === contextWindow,
		) && contextWindow === "1m"
			? `${model}[1m]`
			: model;
	return [support.modelFlag, resolvedModel];
}

/** Environment overrides required to honor an explicit context-window choice. */
export function buildAgentContextWindowEnv(
	presetId: string,
	model: string | undefined,
	contextWindow?: string,
): AgentContextWindowEnv {
	if (
		presetId !== "claude" ||
		!model ||
		(contextWindow !== "200k" && contextWindow !== "1m")
	) {
		return {};
	}
	const support = getAgentContextWindowSupport(presetId, model);
	if (!support?.contextWindows.some((option) => option.id === contextWindow)) {
		return {};
	}
	return {
		CLAUDE_CODE_DISABLE_1M_CONTEXT: contextWindow === "200k" ? "1" : "0",
	};
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
	runtimeModelIds?: readonly string[],
): Record<string, string> {
	if (!model) return {};
	const support = getAgentModelSupport(presetId);
	if (!support?.modelEnv) return {};
	const allowedModelIds =
		runtimeModelIds ?? support.models.map((option) => option.id);
	if (!allowedModelIds.includes(model)) return {};
	return { [support.modelEnv]: model };
}
