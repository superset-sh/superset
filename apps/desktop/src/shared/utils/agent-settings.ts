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
	type ChatAgentDefinition,
	isTerminalAgentDefinition,
	type TerminalAgentDefinition,
} from "@superset/shared/agent-catalog";
import type { TaskInput } from "@superset/shared/agent-command";
import { createTerminalAgentDefinition } from "@superset/shared/agent-definition";
import {
	buildPromptCommandString,
	buildPromptFileCommandString,
	type PromptTransport,
} from "@superset/shared/agent-prompt-launch";
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

export type TerminalResolvedAgentConfig = Omit<
	TerminalAgentDefinition,
	"id"
> & {
	id: AgentDefinitionId;
	overriddenFields: AgentPresetField[];
};

export type ChatResolvedAgentConfig = Omit<ChatAgentDefinition, "id"> & {
	id: AgentDefinitionId;
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

export type CustomAgentDefinitionPatch = Partial<{
	enabled: boolean;
	label: string;
	description: string | null;
	command: string;
	promptCommand: string | null;
	promptCommandSuffix: string | null;
	promptTransport: PromptTransport | null;
	taskPromptTemplate: string;
}>;

function toUserTerminalAgentDefinition(
	customDefinition: AgentCustomDefinition,
): TerminalAgentDefinition {
	return createTerminalAgentDefinition({
		id: customDefinition.id as `custom:${string}`,
		source: "user",
		kind: "terminal",
		label: customDefinition.label,
		description: customDefinition.description,
		command: customDefinition.command,
		promptCommand: customDefinition.promptCommand,
		promptCommandSuffix: customDefinition.promptCommandSuffix,
		promptTransport: customDefinition.promptTransport,
		taskPromptTemplate: customDefinition.taskPromptTemplate,
		enabled: customDefinition.enabled ?? true,
	});
}

function canonicalizeCustomAgentDefinition(
	definition: AgentCustomDefinition,
): AgentCustomDefinition {
	const nextDefinition: AgentCustomDefinition = { ...definition };

	if (nextDefinition.promptCommand === nextDefinition.command) {
		nextDefinition.promptCommand = undefined;
	}
	if (nextDefinition.promptTransport === "argv") {
		nextDefinition.promptTransport = undefined;
	}

	return agentCustomDefinitionSchema.parse(nextDefinition);
}

export function readAgentCustomDefinitions(
	customDefinitions: AgentCustomDefinition[] | null | undefined,
): AgentCustomDefinition[] {
	return (customDefinitions ?? []).flatMap((definition) => {
		const parsed = agentCustomDefinitionSchema.safeParse(definition);
		return parsed.success
			? [canonicalizeCustomAgentDefinition(parsed.data)]
			: [];
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
		...readAgentCustomDefinitions(customDefinitions).map((definition) =>
			toUserTerminalAgentDefinition(definition),
		),
	];
}

export function getCustomAgentDefinitionById({
	customDefinitions,
	id,
}: {
	customDefinitions?: AgentCustomDefinition[] | null;
	id: `custom:${string}`;
}): AgentCustomDefinition | null {
	return (
		readAgentCustomDefinitions(customDefinitions).find(
			(definition) => definition.id === id,
		) ?? null
	);
}

export function upsertCustomAgentDefinition({
	currentDefinitions,
	definition,
}: {
	currentDefinitions?: AgentCustomDefinition[] | null;
	definition: AgentCustomDefinition;
}): AgentCustomDefinition[] {
	const definitions = readAgentCustomDefinitions(currentDefinitions);
	const nextDefinition = canonicalizeCustomAgentDefinition(
		agentCustomDefinitionSchema.parse(definition),
	);
	const index = definitions.findIndex(
		(candidate) => candidate.id === nextDefinition.id,
	);
	if (index === -1) {
		return [...definitions, nextDefinition];
	}

	return definitions.map((candidate, candidateIndex) =>
		candidateIndex === index ? nextDefinition : candidate,
	);
}

export function applyCustomAgentDefinitionPatch({
	definition,
	patch,
}: {
	definition: AgentCustomDefinition;
	patch: CustomAgentDefinitionPatch;
}): AgentCustomDefinition {
	const nextDefinition: AgentCustomDefinition = { ...definition };

	if (Object.hasOwn(patch, "enabled")) {
		nextDefinition.enabled = patch.enabled;
	}
	if (Object.hasOwn(patch, "label") && patch.label !== undefined) {
		nextDefinition.label = patch.label;
	}
	if (Object.hasOwn(patch, "description")) {
		nextDefinition.description = patch.description ?? undefined;
	}
	if (Object.hasOwn(patch, "command") && patch.command !== undefined) {
		nextDefinition.command = patch.command;
	}
	if (
		Object.hasOwn(patch, "promptCommand") &&
		patch.promptCommand !== undefined
	) {
		nextDefinition.promptCommand = patch.promptCommand ?? undefined;
	}
	if (Object.hasOwn(patch, "promptCommandSuffix")) {
		nextDefinition.promptCommandSuffix = patch.promptCommandSuffix ?? undefined;
	}
	if (Object.hasOwn(patch, "promptTransport")) {
		nextDefinition.promptTransport = patch.promptTransport ?? undefined;
	}
	if (
		Object.hasOwn(patch, "taskPromptTemplate") &&
		patch.taskPromptTemplate !== undefined
	) {
		nextDefinition.taskPromptTemplate = patch.taskPromptTemplate;
	}

	return agentCustomDefinitionSchema.parse(nextDefinition);
}

export function deleteCustomAgentDefinition({
	currentDefinitions,
	id,
}: {
	currentDefinitions?: AgentCustomDefinition[] | null;
	id: `custom:${string}`;
}): AgentCustomDefinition[] {
	return readAgentCustomDefinitions(currentDefinitions).filter(
		(definition) => definition.id !== id,
	);
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
	description: string | undefined,
	override: AgentPresetOverride | undefined,
): string | undefined {
	if (!override || !Object.hasOwn(override, "description")) {
		return description;
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
	model: string | undefined,
	override: AgentPresetOverride | undefined,
): string | undefined {
	if (!override || !Object.hasOwn(override, "model")) {
		return model;
	}

	return override.model?.trim() || undefined;
}

function resolveAgentConfig(
	definition: AgentDefinition,
	override: AgentPresetOverride | undefined,
): ResolvedAgentConfig {
	if (isTerminalAgentDefinition(definition)) {
		return {
			...definition,
			id: definition.id as AgentDefinitionId,
			label: override?.label ?? definition.label,
			description: resolveDescription(definition.description, override),
			enabled: override?.enabled ?? definition.enabled,
			command: override?.command ?? definition.command,
			promptCommand: override?.promptCommand ?? definition.promptCommand,
			promptCommandSuffix: resolvePromptCommandSuffix(
				definition.promptCommandSuffix,
				override,
			),
			taskPromptTemplate:
				override?.taskPromptTemplate ?? definition.taskPromptTemplate,
			overriddenFields: getOverriddenFields(override, definition),
		};
	}

	return {
		...definition,
		id: definition.id as AgentDefinitionId,
		label: override?.label ?? definition.label,
		description: resolveDescription(definition.description, override),
		enabled: override?.enabled ?? definition.enabled,
		taskPromptTemplate:
			override?.taskPromptTemplate ?? definition.taskPromptTemplate,
		model: resolveModel(definition.model, override),
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
		resolveAgentConfig(
			definition,
			definition.source === "builtin"
				? overridesById.get(definition.id)
				: undefined,
		),
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

	return buildPromptCommandString({
		prompt,
		randomId,
		command: promptCommand,
		suffix: config.promptCommandSuffix?.trim() || undefined,
		transport: config.promptTransport,
	});
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

	return buildPromptFileCommandString({
		filePath,
		command: promptCommand,
		suffix: config.promptCommandSuffix?.trim() || undefined,
		transport: config.promptTransport,
	});
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
		setOrDelete("enabled", patch.enabled, patch.enabled !== definition.enabled);
	}
	if (hasField("label")) {
		setOrDelete("label", patch.label, patch.label !== definition.label);
	}
	if (hasField("description")) {
		const defaultDescription = definition.description;
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
			patch.taskPromptTemplate !== definition.taskPromptTemplate,
		);
	}

	if (definition.kind === "terminal") {
		if (hasField("command")) {
			setOrDelete(
				"command",
				patch.command,
				patch.command !== definition.command,
			);
		}
		if (hasField("promptCommand")) {
			setOrDelete(
				"promptCommand",
				patch.promptCommand,
				patch.promptCommand !== definition.promptCommand,
			);
		}
		if (hasField("promptCommandSuffix")) {
			const shouldPersist =
				patch.promptCommandSuffix === null
					? definition.promptCommandSuffix !== undefined
					: patch.promptCommandSuffix !== definition.promptCommandSuffix;
			setOrDelete(
				"promptCommandSuffix",
				patch.promptCommandSuffix,
				shouldPersist,
			);
		}
	} else if (hasField("model")) {
		const shouldPersist =
			patch.model === null
				? definition.model !== undefined
				: patch.model !== definition.model;
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
