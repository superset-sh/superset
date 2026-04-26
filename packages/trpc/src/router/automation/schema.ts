import { automationSessionKindValues } from "@superset/db/schema";
import type { ResolvedAgentConfig } from "@superset/shared/agent-settings";
import { z } from "zod";

/**
 * Minimal shape check for the snapshotted ResolvedAgentConfig. We trust the
 * client to construct the full config (command, promptCommand, etc.) — this
 * just ensures we have an id + kind so the dispatcher can route correctly.
 */
const agentConfigSchema = z
	.object({
		id: z.string().min(1),
		kind: z.enum(["terminal", "chat"]),
	})
	.passthrough() as unknown as z.ZodType<ResolvedAgentConfig>;

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

export const createAutomationSchema = z.object({
	name: z.string().min(1).max(200),
	prompt: z.string().min(1).max(20_000),
	agentConfig: agentConfigSchema,
	targetHostId: z.string().uuid().nullish(),
	v2ProjectId: z.string().uuid(),
	v2WorkspaceId: z.string().uuid().nullish(),
	rrule: rruleBody,
	dtstart: z.coerce.date().optional(),
	timezone: iana,
	mcpScope: z.array(z.string()).default([]),
});

export const updateAutomationSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(200).optional(),
	prompt: z.string().min(1).max(20_000).optional(),
	agentConfig: agentConfigSchema.optional(),
	targetHostId: z.string().uuid().nullish(),
	v2ProjectId: z.string().uuid().optional(),
	v2WorkspaceId: z.string().uuid().nullish(),
	rrule: rruleBody.optional(),
	dtstart: z.coerce.date().optional(),
	timezone: iana.optional(),
	mcpScope: z.array(z.string()).optional(),
});

export const listRunsSchema = z.object({
	automationId: z.string().uuid(),
	limit: z.number().int().min(1).max(100).default(20),
});

export const parseRruleSchema = z.object({
	rrule: rruleBody,
	timezone: iana,
	dtstart: z.coerce.date().optional(),
});

export const sessionKindSchema = z.enum(automationSessionKindValues);

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;
