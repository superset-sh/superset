import { automationSessionKindValues } from "@superset/db/schema";
import { draftTriggerSchema } from "@superset/shared/automation-triggers";
import { workspaceTagsInputSchema } from "@superset/shared/workspace-tags";
import { z } from "zod";

/**
 * The full trigger set, saved with the automation rather than edited one row at
 * a time — the editor holds the whole automation and Save commits it.
 *
 * Optional while the older clients (CLI, SDK, MCP, desktop) still send a
 * top-level `rrule`; those are folded into a single schedule trigger server-side
 * so both shapes converge on the same rows.
 */
const triggers = z.array(draftTriggerSchema).max(25).optional();

const agentSchema = z.string().min(1).max(200);

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

export const createAutomationSchema = z
	.object({
		name: z.string().min(1).max(200),
		// Empty is allowed: "New automation" creates an untitled automation the
		// detail page fills in. Dispatch refuses to run an instruction-less one.
		prompt: z.string().max(100_000),
		agent: agentSchema,
		targetHostId: z.string().min(1).nullish(),
		// Null/omitted with no workspace pin = session automation: each run
		// creates a project-less session workspace (same convention as
		// workspaces.create — no project means session).
		v2ProjectId: z.string().uuid().nullish(),
		v2WorkspaceId: z.string().uuid().nullish(),
		// Workspace tags applied to each run's created workspace, so runs file
		// themselves into the matching sidebar folders.
		tags: workspaceTagsInputSchema.optional(),
		// Optional because an automation may be entirely event-driven. Required
		// only when no trigger set is supplied, which is the older client shape.
		rrule: rruleBody.optional(),
		dtstart: z.coerce.date().optional(),
		timezone: iana.optional(),
		triggers,
	})
	.refine((v) => v.triggers !== undefined || v.rrule !== undefined, {
		message: "Provide either a trigger set or a schedule",
		path: ["triggers"],
	})
	.refine((v) => v.rrule === undefined || v.timezone !== undefined, {
		message: "A schedule needs a timezone",
		path: ["timezone"],
	});

export const updateAutomationSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(200).optional(),
	prompt: z.string().max(100_000).optional(),
	agent: agentSchema.optional(),
	targetHostId: z.string().min(1).nullish(),
	// Explicit null switches the automation to session mode; undefined keeps
	// the existing project.
	v2ProjectId: z.string().uuid().nullish(),
	v2WorkspaceId: z.string().uuid().nullish(),
	// Full replacement of the tag set; undefined keeps the existing tags.
	tags: workspaceTagsInputSchema.optional(),
	rrule: rruleBody.optional(),
	dtstart: z.coerce.date().optional(),
	timezone: iana.optional(),
	triggers,
});

export const setAutomationPromptSchema = z.object({
	id: z.string().uuid(),
	// Empty is allowed so an untitled automation's editor can save its way
	// through intermediate states (and instructions can be cleared outright).
	prompt: z.string().max(100_000),
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
