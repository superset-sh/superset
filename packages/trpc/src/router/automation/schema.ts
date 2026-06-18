import { automationSessionKindValues } from "@superset/db/schema";
import { z } from "zod";
import { capabilityBindingInputSchema } from "../capability/schema";

const agentSchema = z.string().min(1).max(200);
const modelSelectionFields = {
	modelProviderId: z.string().uuid().nullish(),
	modelId: z.string().trim().min(1).max(500).nullish(),
	modelConfig: z.record(z.string(), z.unknown()).optional(),
} as const;

function isValidIanaTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat(undefined, { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

const iana = z
	.string()
	.min(1)
	.refine(isValidIanaTimezone, "Invalid IANA timezone name")
	.describe("IANA timezone name");
const rruleBody = z
	.string()
	.min(1)
	.max(500)
	.describe("RFC 5545 RRULE body, no DTSTART prefix");

function requireCompleteModelSelection(
	input: { modelProviderId?: string | null; modelId?: string | null },
	ctx: z.RefinementCtx,
): void {
	const hasProvider = input.modelProviderId != null;
	const hasModel = input.modelId != null;
	if (hasProvider === hasModel) return;
	ctx.addIssue({
		code: "custom",
		path: hasProvider ? ["modelId"] : ["modelProviderId"],
		message: "Model provider and model are both required",
	});
}

export const createAutomationSchema = z
	.object({
		name: z.string().min(1).max(200),
		prompt: z.string().min(1).max(100_000),
		agent: agentSchema,
		...modelSelectionFields,
		targetHostId: z.string().min(1).nullish(),
		v2ProjectId: z.string().uuid().nullish(),
		v2WorkspaceId: z.null().optional(),
		rrule: rruleBody,
		dtstart: z.coerce.date().optional(),
		timezone: iana,
		mcpScope: z.array(z.string()).default([]),
		capabilities: z.array(capabilityBindingInputSchema).max(100).default([]),
	})
	.superRefine(requireCompleteModelSelection);

export const updateAutomationSchema = z
	.object({
		id: z.string().uuid(),
		name: z.string().min(1).max(200).optional(),
		agent: agentSchema.optional(),
		...modelSelectionFields,
		targetHostId: z.string().min(1).nullish(),
		v2ProjectId: z.string().uuid().nullish(),
		v2WorkspaceId: z.null().optional(),
		rrule: rruleBody.optional(),
		dtstart: z.coerce.date().optional(),
		timezone: iana.optional(),
		mcpScope: z.array(z.string()).optional(),
		capabilities: z.array(capabilityBindingInputSchema).max(100).optional(),
	})
	.superRefine(requireCompleteModelSelection);

export const setAutomationPromptSchema = z.object({
	id: z.string().uuid(),
	prompt: z.string().min(1).max(100_000),
});

export const listRunsSchema = z.object({
	automationId: z.string().uuid(),
	limit: z.number().int().min(1).max(100).default(20),
});

export const getRunSchema = z.object({
	runId: z.string().uuid(),
});

export const reconcileRunSchema = z.object({
	runId: z.string().uuid(),
});

export const completeRunSchema = z.object({
	runId: z.string().uuid(),
	resultMarkdown: z.string().min(1).max(200_000),
	resultJson: z.record(z.string(), z.unknown()).optional(),
	resultSummary: z.string().max(2_000).optional(),
});

export const failRunSchema = z.object({
	runId: z.string().uuid(),
	failureReason: z.string().min(1).max(10_000),
	resultMarkdown: z.string().max(200_000).optional(),
	resultJson: z.record(z.string(), z.unknown()).optional(),
	resultSummary: z.string().max(2_000).optional(),
});

export const parseRruleSchema = z.object({
	rrule: rruleBody,
	timezone: iana,
	dtstart: z.coerce.date().optional(),
});

export const sessionKindSchema = z.enum(automationSessionKindValues);

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;
