import type { AgentDefinition } from "@superset/shared/agent-catalog";
import { TRPCError } from "@trpc/server";
import type { AgentPresetPatch } from "shared/utils/agent-settings";
import { validateTaskPromptTemplate } from "shared/utils/agent-settings";
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
