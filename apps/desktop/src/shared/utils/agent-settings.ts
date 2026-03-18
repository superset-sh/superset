import {
	type AgentCustomDefinition,
	type AgentPresetField,
	type AgentPresetOverride,
	type AgentPresetOverrideEnvelope,
	agentCustomDefinitionSchema,
	agentPresetOverrideEnvelopeSchema,
} from "@superset/local-db";
import {
	type AgentDefinition,
	type AgentDefinitionId,
	BUILTIN_AGENT_DEFINITIONS,
	isTerminalAgentDefinition,
	type TerminalAgentDefinition,
} from "@superset/shared/agent-catalog";
import type { TaskInput } from "@superset/shared/agent-command";
import {
	DEFAULT_CHAT_TASK_PROMPT_TEMPLATE,
	DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE,
	getSupportedTaskPromptVariables,
	renderTaskPromptTemplate,
	validateTaskPromptTemplate,
} from "@superset/shared/agent-prompt-template";

const TERMINAL_OVERRIDE_FIELDS = [
	"enabled",
	"label",
	"description",
	"command",
	"promptCommand",
	"promptCommandSuffix",
	"taskPromptTemplate",
] as const satisfies readonly AgentPresetField[];

const CHAT_OVERRIDE_FIELDS = [
	"enabled",
	"label",
	"description",
	"taskPromptTemplate",
	"model",
] as const satisfies readonly AgentPresetField[];

const EMPTY_AGENT_PRESET_OVERRIDE_ENVELOPE: AgentPresetOverrideEnvelope = {
	version: 1,
	presets: [],
};

export type TerminalResolvedAgentConfig = {
	id: AgentDefinitionId;
	source: "builtin" | "user";
	kind: "terminal";
	label: string;
	description?: string;
	enabled: boolean;
	command: string;
	promptCommand: string;
	promptCommandSuffix?: string;
	taskPromptTemplate: string;
	overriddenFields: AgentPresetField[];
};

export type ChatResolvedAgentConfig = {
	id: AgentDefinitionId;
	source: "builtin" | "user";
	kind: "chat";
	label: string;
	description?: string;
	enabled: boolean;
	taskPromptTemplate: string;
	model?: string;
	overriddenFields: AgentPresetField[];
};

export type ResolvedAgentConfig =
	| TerminalResolvedAgentConfig
	| ChatResolvedAgentConfig;

export type AgentPresetPatch = Partial<{
	enabled: boolean;
	label: string;
	description: string | null;
	command: string;
	promptCommand: string;
	promptCommandSuffix: string | null;
	taskPromptTemplate: string;
	model: string | null;
}>;

function toCustomAgentDefinition(
	customDefinition: AgentCustomDefinition,
): TerminalAgentDefinition {
	return {
		id: customDefinition.id as `custom:${string}`,
		source: "user",
		kind: "terminal",
		defaultLabel: customDefinition.label,
		defaultDescription: customDefinition.description,
		defaultCommand: customDefinition.command,
		defaultPromptCommand: customDefinition.promptCommand,
		defaultPromptCommandSuffix: customDefinition.promptCommandSuffix,
		defaultTaskPromptTemplate: customDefinition.taskPromptTemplate,
		defaultEnabled: customDefinition.enabled ?? true,
	};
}

function readCustomDefinitions(
	customDefinitions: AgentCustomDefinition[] | null | undefined,
): AgentCustomDefinition[] {
	return (customDefinitions ?? []).flatMap((definition) => {
		const parsed = agentCustomDefinitionSchema.safeParse(definition);
		return parsed.success ? [parsed.data] : [];
	});
}

export function readAgentPresetOverrides(
	overrideEnvelope: AgentPresetOverrideEnvelope | null | undefined,
): AgentPresetOverrideEnvelope {
	const parsed = agentPresetOverrideEnvelopeSchema.safeParse(
		overrideEnvelope ?? EMPTY_AGENT_PRESET_OVERRIDE_ENVELOPE,
	);
	return parsed.success ? parsed.data : EMPTY_AGENT_PRESET_OVERRIDE_ENVELOPE;
}

export function getAgentDefinitions(
	customDefinitions: AgentCustomDefinition[] | null | undefined,
): AgentDefinition[] {
	return [
		...BUILTIN_AGENT_DEFINITIONS,
		...readCustomDefinitions(customDefinitions).map((definition) =>
			toCustomAgentDefinition(definition),
		),
	];
}

function getOverriddenFields(
	override: AgentPresetOverride | undefined,
	definition: AgentDefinition,
): AgentPresetField[] {
	if (!override) return [];

	const fields =
		definition.kind === "terminal"
			? TERMINAL_OVERRIDE_FIELDS
			: CHAT_OVERRIDE_FIELDS;

	return fields.filter((field) => Object.hasOwn(override, field));
}

function resolveDescription(
	defaultDescription: string | undefined,
	override: AgentPresetOverride | undefined,
): string | undefined {
	if (!override || !Object.hasOwn(override, "description")) {
		return defaultDescription;
	}

	return override.description ?? undefined;
}

function resolvePromptCommandSuffix(
	defaultSuffix: string | undefined,
	override: AgentPresetOverride | undefined,
): string | undefined {
	if (!override || !Object.hasOwn(override, "promptCommandSuffix")) {
		return defaultSuffix;
	}

	return override.promptCommandSuffix ?? undefined;
}

function resolveModel(
	defaultModel: string | undefined,
	override: AgentPresetOverride | undefined,
): string | undefined {
	if (!override || !Object.hasOwn(override, "model")) {
		return defaultModel;
	}

	return override.model?.trim() || undefined;
}

function resolveAgentConfig(
	definition: AgentDefinition,
	override: AgentPresetOverride | undefined,
): ResolvedAgentConfig {
	if (isTerminalAgentDefinition(definition)) {
		return {
			id: definition.id,
			source: definition.source,
			kind: "terminal",
			label: override?.label ?? definition.defaultLabel,
			description: resolveDescription(definition.defaultDescription, override),
			enabled: override?.enabled ?? definition.defaultEnabled,
			command: override?.command ?? definition.defaultCommand,
			promptCommand: override?.promptCommand ?? definition.defaultPromptCommand,
			promptCommandSuffix: resolvePromptCommandSuffix(
				definition.defaultPromptCommandSuffix,
				override,
			),
			taskPromptTemplate:
				override?.taskPromptTemplate ?? definition.defaultTaskPromptTemplate,
			overriddenFields: getOverriddenFields(override, definition),
		};
	}

	return {
		id: definition.id,
		source: definition.source,
		kind: "chat",
		label: override?.label ?? definition.defaultLabel,
		description: resolveDescription(definition.defaultDescription, override),
		enabled: override?.enabled ?? definition.defaultEnabled,
		taskPromptTemplate:
			override?.taskPromptTemplate ?? definition.defaultTaskPromptTemplate,
		model: resolveModel(definition.defaultModel, override),
		overriddenFields: getOverriddenFields(override, definition),
	};
}

export function resolveAgentConfigs({
	customDefinitions,
	overrideEnvelope,
}: {
	customDefinitions?: AgentCustomDefinition[] | null;
	overrideEnvelope?: AgentPresetOverrideEnvelope | null;
}): ResolvedAgentConfig[] {
	const overridesById = new Map(
		readAgentPresetOverrides(overrideEnvelope).presets.map((preset) => [
			preset.id,
			preset,
		]),
	);

	return getAgentDefinitions(customDefinitions).map((definition) =>
		resolveAgentConfig(definition, overridesById.get(definition.id)),
	);
}

export function getAgentDefinitionById({
	customDefinitions,
	id,
}: {
	customDefinitions?: AgentCustomDefinition[] | null;
	id: AgentDefinitionId;
}): AgentDefinition | null {
	return (
		getAgentDefinitions(customDefinitions).find(
			(definition) => definition.id === id,
		) ?? null
	);
}

export function indexResolvedAgentConfigs(
	configs: ResolvedAgentConfig[],
): Map<AgentDefinitionId, ResolvedAgentConfig> {
	return new Map(configs.map((config) => [config.id, config]));
}

export function getEnabledAgentConfigs(
	configs: ResolvedAgentConfig[],
): ResolvedAgentConfig[] {
	return configs.filter((config) => config.enabled);
}

export function getFallbackAgentId(
	configs: ResolvedAgentConfig[],
): AgentDefinitionId | null {
	const enabledConfigs = getEnabledAgentConfigs(configs);
	if (enabledConfigs.length === 0) return null;

	const preferredClaude = enabledConfigs.find(
		(config) => config.id === "claude",
	);
	return preferredClaude?.id ?? enabledConfigs[0]?.id ?? null;
}

function buildHeredoc(
	prompt: string,
	delimiter: string,
	command: string,
	suffix?: string,
): string {
	const closing = suffix ? `)" ${suffix}` : ')"';
	return [
		`${command} "$(cat <<'${delimiter}'`,
		prompt,
		delimiter,
		closing,
	].join("\n");
}

function buildFileCommand(
	filePath: string,
	command: string,
	suffix?: string,
): string {
	const escapedPath = filePath.replaceAll("'", "'\\''");
	return `${command} "$(cat '${escapedPath}')"${suffix ? ` ${suffix}` : ""}`;
}

export function getCommandFromAgentConfig(
	config: TerminalResolvedAgentConfig,
): string | null {
	const command = config.command.trim();
	return command.length > 0 ? command : null;
}

export function buildPromptCommandFromAgentConfig({
	prompt,
	randomId,
	config,
}: {
	prompt: string;
	randomId: string;
	config: TerminalResolvedAgentConfig;
}): string | null {
	const promptCommand = config.promptCommand.trim() || config.command.trim();
	if (!promptCommand) return null;

	let delimiter = `SUPERSET_PROMPT_${randomId.replaceAll("-", "")}`;
	while (prompt.includes(delimiter)) {
		delimiter = `${delimiter}_X`;
	}

	const suffix = config.promptCommandSuffix?.trim() || undefined;
	return buildHeredoc(prompt, delimiter, promptCommand, suffix);
}

export function buildFileCommandFromAgentConfig({
	filePath,
	config,
}: {
	filePath: string;
	config: TerminalResolvedAgentConfig;
}): string | null {
	const promptCommand = config.promptCommand.trim() || config.command.trim();
	if (!promptCommand) return null;

	const suffix = config.promptCommandSuffix?.trim() || undefined;
	return buildFileCommand(filePath, promptCommand, suffix);
}

export function buildDefaultTerminalTaskPrompt(task: TaskInput): string {
	return renderTaskPromptTemplate(DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE, task);
}

export function buildDefaultChatTaskPrompt(task: TaskInput): string {
	return renderTaskPromptTemplate(DEFAULT_CHAT_TASK_PROMPT_TEMPLATE, task);
}

export {
	DEFAULT_CHAT_TASK_PROMPT_TEMPLATE,
	DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE,
	getSupportedTaskPromptVariables,
	renderTaskPromptTemplate,
	validateTaskPromptTemplate,
};

export function createOverrideEnvelopeWithPatch({
	definition,
	currentOverrides,
	id,
	patch,
}: {
	definition: AgentDefinition;
	currentOverrides: AgentPresetOverrideEnvelope | null | undefined;
	id: AgentDefinitionId;
	patch: AgentPresetPatch;
}): AgentPresetOverrideEnvelope {
	const envelope = readAgentPresetOverrides(currentOverrides);
	const nextOverrides = new Map(
		envelope.presets.map((preset) => [preset.id, preset]),
	);
	const current = nextOverrides.get(id) ?? { id };
	const next: AgentPresetOverride = { ...current, id };

	const setOrDelete = (
		field: keyof AgentPresetOverride,
		value: AgentPresetOverride[keyof AgentPresetOverride],
		shouldPersist: boolean,
	) => {
		if (shouldPersist) {
			(next as Record<string, unknown>)[field] = value;
			return;
		}
		delete (next as Record<string, unknown>)[field];
	};

	const hasField = <TField extends keyof AgentPresetPatch>(field: TField) =>
		Object.hasOwn(patch, field);

	if (hasField("enabled")) {
		setOrDelete(
			"enabled",
			patch.enabled,
			patch.enabled !== definition.defaultEnabled,
		);
	}
	if (hasField("label")) {
		setOrDelete("label", patch.label, patch.label !== definition.defaultLabel);
	}
	if (hasField("description")) {
		const defaultDescription = definition.defaultDescription;
		const shouldPersist =
			patch.description === null
				? defaultDescription !== undefined
				: patch.description !== defaultDescription;
		setOrDelete("description", patch.description, shouldPersist);
	}
	if (hasField("taskPromptTemplate")) {
		setOrDelete(
			"taskPromptTemplate",
			patch.taskPromptTemplate,
			patch.taskPromptTemplate !== definition.defaultTaskPromptTemplate,
		);
	}

	if (definition.kind === "terminal") {
		if (hasField("command")) {
			setOrDelete(
				"command",
				patch.command,
				patch.command !== definition.defaultCommand,
			);
		}
		if (hasField("promptCommand")) {
			setOrDelete(
				"promptCommand",
				patch.promptCommand,
				patch.promptCommand !== definition.defaultPromptCommand,
			);
		}
		if (hasField("promptCommandSuffix")) {
			const shouldPersist =
				patch.promptCommandSuffix === null
					? definition.defaultPromptCommandSuffix !== undefined
					: patch.promptCommandSuffix !== definition.defaultPromptCommandSuffix;
			setOrDelete(
				"promptCommandSuffix",
				patch.promptCommandSuffix,
				shouldPersist,
			);
		}
	} else if (hasField("model")) {
		const shouldPersist =
			patch.model === null
				? definition.defaultModel !== undefined
				: patch.model !== definition.defaultModel;
		setOrDelete("model", patch.model ?? undefined, shouldPersist);
	}

	const fields = Object.keys(next).filter((field) => field !== "id");
	if (fields.length === 0) {
		nextOverrides.delete(id);
	} else {
		nextOverrides.set(id, next);
	}

	return {
		version: 1,
		presets: Array.from(nextOverrides.values()),
	};
}

export function resetAgentPresetOverride({
	currentOverrides,
	id,
}: {
	currentOverrides: AgentPresetOverrideEnvelope | null | undefined;
	id: AgentDefinitionId;
}): AgentPresetOverrideEnvelope {
	const envelope = readAgentPresetOverrides(currentOverrides);
	return {
		version: 1,
		presets: envelope.presets.filter((preset) => preset.id !== id),
	};
}

export function resetAllAgentPresetOverrides(): AgentPresetOverrideEnvelope {
	return EMPTY_AGENT_PRESET_OVERRIDE_ENVELOPE;
}
export type { AgentDefinitionId } from "@superset/shared/agent-catalog";
