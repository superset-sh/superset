import { automationTriggerKindValues } from "@superset/db/schema";
import { z } from "zod";

/**
 * Three states, deliberately tagged rather than inferred from the JSON shape:
 * `null` matches nothing, `{mode:"any"}` matches everything, and a list matches
 * those ids. A bare string array can't express "any" without reserving a magic
 * value, and every id space here is user-controlled — a GitHub label really can
 * be named "any" — so the tag is what keeps that legal.
 */
const triggerScope = z
	.union([
		z.null(),
		z.object({ mode: z.literal("any") }),
		z.object({
			mode: z.literal("list"),
			ids: z.array(z.string().min(1)).min(1).max(200),
		}),
	])
	.describe("null = nothing, {mode:'any'} = everything, or an explicit list");

const triggerActor = z
	.union([
		z.literal("anyone"),
		z.literal("org_members"),
		z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }),
	])
	.describe("Who may cause this trigger to fire");

/** Non-empty so a trigger can't be saved in a state that matches nothing. */
const events = z.array(z.string().min(1).max(100)).min(1).max(50);

export const scheduleTriggerConfigSchema = z.object({
	kind: z.literal("schedule"),
	rrule: z.string().min(1).max(500),
	dtstart: z.string().datetime(),
	timezone: z.string().min(1),
});

export const webhookTriggerConfigSchema = z.object({
	kind: z.literal("webhook"),
});

export const githubTriggerConfigSchema = z.object({
	kind: z.literal("github"),
	events,
	repositories: triggerScope,
	branches: triggerScope,
	labels: triggerScope,
	actor: triggerActor,
	// Fork payloads carry attacker-controlled content into a checkout the agent
	// runs in. Typed as a constant so enabling it is a deliberate schema change
	// with a threat model attached, not a checkbox.
	includeForks: z.literal(false),
});

export const slackTriggerConfigSchema = z.object({
	kind: z.literal("slack"),
	events,
	channels: triggerScope,
	emoji: triggerScope,
	actor: triggerActor,
	keyword: z.string().min(1).max(200).optional(),
});

export const linearTriggerConfigSchema = z.object({
	kind: z.literal("linear"),
	events,
	teams: triggerScope,
	projects: triggerScope,
});

export const sentryTriggerConfigSchema = z.object({
	kind: z.literal("sentry"),
	events,
	projects: triggerScope,
	level: triggerScope,
});

export const triggerConfigSchema = z.discriminatedUnion("kind", [
	scheduleTriggerConfigSchema,
	webhookTriggerConfigSchema,
	githubTriggerConfigSchema,
	slackTriggerConfigSchema,
	linearTriggerConfigSchema,
	sentryTriggerConfigSchema,
]);

export const triggerKindSchema = z.enum(automationTriggerKindValues);

export const createTriggerSchema = z
	.object({
		automationId: z.string().uuid(),
		config: triggerConfigSchema,
		enabled: z.boolean().default(true),
	})
	// The column and the config both carry the kind, and a CHECK constraint
	// rejects any row where they disagree. Deriving it here means a caller can
	// never be the one to disagree.
	.transform((input) => ({ ...input, kind: input.config.kind }));

export const updateTriggerSchema = z.object({
	id: z.string().uuid(),
	config: triggerConfigSchema.optional(),
	enabled: z.boolean().optional(),
});

export const deleteTriggerSchema = z.object({ id: z.string().uuid() });

export const listTriggersSchema = z.object({
	automationId: z.string().uuid().optional(),
});
