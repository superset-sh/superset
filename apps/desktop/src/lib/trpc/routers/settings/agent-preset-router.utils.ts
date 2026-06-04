import { PROMPT_TRANSPORTS } from "@superset/local-db";
import type { AgentDefinition } from "@superset/shared/agent-catalog";
import type {
	AgentPresetPatch,
	CustomAgentDefinitionPatch,
} from "@superset/shared/agent-settings";
import { validateTaskPromptTemplate } from "@superset/shared/agent-settings";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const updateAgentPresetInputSchema = z.object({
	id: z.string().min(1),
	patch: z
		.object({
			enabled: z.boolean().optional(),
			label: z.string().optional(),
			description: z.string().nullable().optional(),
			command: z.string().optional(),
			promptCommand: z.string().optional(),
			promptCommandSuffix: z.string().nullable().optional(),
			taskPromptTemplate: z.string().optional(),
			model: z.string().nullable().optional(),
		})
		.refine((patch) => Object.keys(patch).length > 0, {
			message: "Patch must include at least one field",
		}),
});

export const createCustomAgentInputSchema = z.object({
	label: z.string(),
	description: z.string().nullable().optional(),
	command: z.string(),
	promptCommand: z.string().optional(),
	promptCommandSuffix: z.string().nullable().optional(),
	promptTransport: z.enum(PROMPT_TRANSPORTS).optional(),
	taskPromptTemplate: z.string(),
	enabled: z.boolean().optional(),
});

export const updateCustomAgentInputSchema = z.object({
	id: z.string().regex(/^custom:/),
	patch: z
		.object({
			label: z.string().optional(),
			description: z.string().nullable().optional(),
			command: z.string().optional(),
			promptCommand: z.string().nullable().optional(),
			promptCommandSuffix: z.string().nullable().optional(),
			promptTransport: z.enum(PROMPT_TRANSPORTS).nullable().optional(),
			taskPromptTemplate: z.string().optional(),
			enabled: z.boolean().optional(),
		})
		.refine((patch) => Object.keys(patch).length > 0, {
			message: "Patch must include at least one field",
		}),
});

function toTrimmedRequiredValue(field: string, value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${field} cannot be empty`,
		});
	}
	return trimmed;
}

export function normalizeAgentPresetPatch({
	definition,
	patch,
}: {
	definition: AgentDefinition;
	patch: z.infer<typeof updateAgentPresetInputSchema>["patch"];
}): AgentPresetPatch {
	const normalized: AgentPresetPatch = {};

	if (patch.enabled !== undefined) {
		normalized.enabled = patch.enabled;
	}
	if (patch.label !== undefined) {
		normalized.label = toTrimmedRequiredValue("Label", patch.label);
	}
	if (patch.description !== undefined) {
		const description = patch.description?.trim() ?? "";
		normalized.description = description ? description : null;
	}
	if (patch.taskPromptTemplate !== undefined) {
		const taskPromptTemplate = toTrimmedRequiredValue(
			"Task prompt template",
			patch.taskPromptTemplate,
		);
		const validation = validateTaskPromptTemplate(taskPromptTemplate);
		if (!validation.valid) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Unknown task prompt variables: ${validation.unknownVariables.join(", ")}`,
			});
		}
		normalized.taskPromptTemplate = taskPromptTemplate;
	}

	if (definition.kind === "terminal") {
		if (patch.command !== undefined) {
			normalized.command = toTrimmedRequiredValue("Command", patch.command);
		}
		if (patch.promptCommand !== undefined) {
			normalized.promptCommand = toTrimmedRequiredValue(
				"Prompt command",
				patch.promptCommand,
			);
		}
		if (patch.promptCommandSuffix !== undefined) {
			const promptCommandSuffix = patch.promptCommandSuffix?.trim() ?? "";
			normalized.promptCommandSuffix = promptCommandSuffix || null;
		}
	} else if (patch.model !== undefined) {
		const model = patch.model?.trim() ?? "";
		normalized.model = model || null;
	}

	if (Object.keys(normalized).length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Patch must include at least one supported field",
		});
	}

	return normalized;
}

function normalizeOptionalText(
	value: string | null | undefined,
): string | null {
	const normalized = value?.trim() ?? "";
	return normalized ? normalized : null;
}

export function normalizeCreateCustomAgentInput(
	input: z.infer<typeof createCustomAgentInputSchema>,
) {
	const command = toTrimmedRequiredValue("Command", input.command);
	const taskPromptTemplate = toTrimmedRequiredValue(
		"Task prompt template",
		input.taskPromptTemplate,
	);
	const validation = validateTaskPromptTemplate(taskPromptTemplate);
	if (!validation.valid) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Unknown task prompt variables: ${validation.unknownVariables.join(", ")}`,
		});
	}

	const promptCommand = normalizeOptionalText(input.promptCommand) ?? undefined;

	return {
		label: toTrimmedRequiredValue("Label", input.label),
		description: normalizeOptionalText(input.description) ?? undefined,
		command,
		promptCommand: promptCommand === command ? undefined : promptCommand,
		promptCommandSuffix:
			normalizeOptionalText(input.promptCommandSuffix) ?? undefined,
		promptTransport:
			input.promptTransport && input.promptTransport !== "argv"
				? input.promptTransport
				: undefined,
		taskPromptTemplate,
		enabled: input.enabled,
	} as const;
}

export function normalizeCustomAgentPatch(
	patch: z.infer<typeof updateCustomAgentInputSchema>["patch"],
): CustomAgentDefinitionPatch {
	const normalized: CustomAgentDefinitionPatch = {};

	if (patch.enabled !== undefined) {
		normalized.enabled = patch.enabled;
	}
	if (patch.label !== undefined) {
		normalized.label = toTrimmedRequiredValue("Label", patch.label);
	}
	if (patch.description !== undefined) {
		normalized.description = normalizeOptionalText(patch.description);
	}
	if (patch.command !== undefined) {
		normalized.command = toTrimmedRequiredValue("Command", patch.command);
	}
	if (patch.promptCommand !== undefined) {
		normalized.promptCommand = normalizeOptionalText(patch.promptCommand);
	}
	if (patch.promptCommandSuffix !== undefined) {
		normalized.promptCommandSuffix = normalizeOptionalText(
			patch.promptCommandSuffix,
		);
	}
	if (patch.promptTransport !== undefined) {
		normalized.promptTransport =
			patch.promptTransport && patch.promptTransport !== "argv"
				? patch.promptTransport
				: null;
	}
	if (patch.taskPromptTemplate !== undefined) {
		const taskPromptTemplate = toTrimmedRequiredValue(
			"Task prompt template",
			patch.taskPromptTemplate,
		);
		const validation = validateTaskPromptTemplate(taskPromptTemplate);
		if (!validation.valid) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Unknown task prompt variables: ${validation.unknownVariables.join(", ")}`,
			});
		}
		normalized.taskPromptTemplate = taskPromptTemplate;
	}

	if (Object.keys(normalized).length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Patch must include at least one supported field",
		});
	}

	return normalized;
}
