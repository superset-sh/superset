import { z } from "zod";
import { PROMPT_TRANSPORTS } from "./agent-prompt-launch";

/**
 * Fields on a builtin agent preset that the user can override.
 */
export const AGENT_PRESET_FIELDS = [
	"enabled",
	"label",
	"description",
	"command",
	"promptCommand",
	"promptCommandSuffix",
	"taskPromptTemplate",
	"contextPromptTemplateSystem",
	"contextPromptTemplateUser",
	"model",
] as const;

export type AgentPresetField = (typeof AGENT_PRESET_FIELDS)[number];

/**
 * Per-preset override stored per-user (applied on top of builtin defaults).
 */
export const agentPresetOverrideSchema = z.object({
	id: z.string(),
	enabled: z.boolean().optional(),
	label: z.string().optional(),
	description: z.string().nullable().optional(),
	command: z.string().optional(),
	promptCommand: z.string().optional(),
	promptCommandSuffix: z.string().nullable().optional(),
	taskPromptTemplate: z.string().optional(),
	contextPromptTemplateSystem: z.string().optional(),
	contextPromptTemplateUser: z.string().optional(),
	model: z.string().optional(),
});

export type AgentPresetOverride = z.infer<typeof agentPresetOverrideSchema>;

export const agentPresetOverrideEnvelopeSchema = z.object({
	version: z.literal(1),
	presets: z.array(agentPresetOverrideSchema),
});

export type AgentPresetOverrideEnvelope = z.infer<
	typeof agentPresetOverrideEnvelopeSchema
>;

/**
 * User-authored terminal agent definition (extends the builtin catalog).
 */
export const agentCustomDefinitionSchema = z.object({
	id: z.string().regex(/^custom:/),
	kind: z.literal("terminal"),
	label: z.string(),
	description: z.string().optional(),
	command: z.string(),
	promptCommand: z.string().optional(),
	promptCommandSuffix: z.string().optional(),
	promptTransport: z.enum(PROMPT_TRANSPORTS).optional(),
	taskPromptTemplate: z.string(),
	contextPromptTemplateSystem: z.string().optional(),
	contextPromptTemplateUser: z.string().optional(),
	enabled: z.boolean().optional(),
});

export type AgentCustomDefinition = z.infer<typeof agentCustomDefinitionSchema>;
