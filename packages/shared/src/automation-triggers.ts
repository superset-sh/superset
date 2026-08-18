import { z } from "zod";

/**
 * Trigger validation, shared by the editor and the API so a form can block Save
 * on exactly what the server would reject.
 *
 * Two levels, and the distinction is the point:
 *
 * - `draftTriggerSchema` accepts a half-configured trigger. The editor has to be
 *   able to hold "Draft opened in [Select Repos]" with nothing selected yet.
 * - `triggerSchema` is what may be saved. Everything the draft form left empty
 *   is required here.
 *
 * `describeTriggerProblems` returns the same messages the form shows, so the
 * client isn't reimplementing rules the server enforces.
 */

/**
 * Three states, tagged rather than inferred from shape: `null` matches nothing,
 * `{mode:"any"}` matches everything, a list matches those ids. Every id space
 * here is user-controlled — a GitHub label really can be named "any" — so a bare
 * `string[] | "any"` would collide with legal values.
 */
export const triggerScopeSchema = z.union([
	z.null(),
	z.object({ mode: z.literal("any") }),
	z.object({
		mode: z.literal("list"),
		ids: z.array(z.string().min(1)).max(200),
	}),
]);
export type TriggerScope = z.infer<typeof triggerScopeSchema>;

export const triggerActorSchema = z.union([
	z.literal("anyone"),
	// Resolves to the automation's owner at match time rather than being
	// expanded to an id on save, so it survives the owner being renamed.
	z.literal("me"),
	z.object({ ids: z.array(z.string().min(1)).max(200) }),
]);
export type TriggerActor = z.infer<typeof triggerActorSchema>;

/** A scope that is set but selects nothing — the "Select Repos" empty state. */
export function isEmptyScope(scope: TriggerScope): boolean {
	return scope === null || (scope.mode === "list" && scope.ids.length === 0);
}

export function isEmptyActor(actor: TriggerActor): boolean {
	return typeof actor !== "string" && actor.ids.length === 0;
}

const rrule = z.string().min(1).max(500);
const iana = z.string().min(1);

/**
 * A free-text match over a comment body.
 *
 * `isRegex` is pinned to false. A user-supplied pattern is evaluated on the
 * webhook path, and JavaScript's engine backtracks: `^(a+)+$` against a
 * non-matching body doubles in cost every two characters — 408ms at 28
 * characters, and never finishing at a realistic comment length. Truncating the
 * body bounds nothing, because the blowup happens within the first few dozen
 * characters. Substring matching covers the common case; regex returns with a
 * linear-time engine.
 */
export const textFilterSchema = z.object({
	pattern: z.string().max(500),
	isRegex: z.literal(false).default(false),
});
export type TextFilter = z.infer<typeof textFilterSchema>;

/**
 * GitHub events carry different filters, so the config is a union on the event
 * rather than one flat shape: a comment filters on two independent people and a
 * body pattern, while a push filters on neither.
 */
export const githubTriggerEventValues = [
	"draft_opened",
	"pull_request.opened",
	"pull_request.pushed",
	"pull_request.merged",
	"comment_added",
	"push_to_branch",
	"label_change",
	"checks_completed",
	"issue_comment",
	"pr_review_comment",
	"pr_review_submitted.approved",
	"pr_review_submitted.changes_requested",
	"pr_review_submitted.commented",
	"pr_review_submitted.any",
	"review_thread.resolved",
	"review_thread.unresolved",
	"review_thread.any",
	"workflow_run.success",
	"workflow_run.failure",
	"workflow_run.cancelled",
	"workflow_run.any",
] as const;
export type GithubTriggerEvent = (typeof githubTriggerEventValues)[number];

const githubCommon = {
	kind: z.literal("github"),
	repositories: triggerScopeSchema,
	branches: triggerScopeSchema,
	labels: triggerScopeSchema,
	// Fork payloads carry attacker-controlled content into a checkout the agent
	// runs in. A literal rather than a boolean, so enabling it is a schema change
	// with a threat model attached rather than a checkbox someone can tick.
	includeForks: z.literal(false).default(false),
};

/** Events describing one action by one person. */
const githubSimpleEvent = z.object({
	...githubCommon,
	event: z.enum([
		"draft_opened",
		"pull_request.opened",
		"pull_request.pushed",
		"pull_request.merged",
		"push_to_branch",
		"label_change",
		"checks_completed",
		"pr_review_comment",
		"pr_review_submitted.approved",
		"pr_review_submitted.changes_requested",
		"pr_review_submitted.commented",
		"pr_review_submitted.any",
		"review_thread.resolved",
		"review_thread.unresolved",
		"review_thread.any",
		"workflow_run.success",
		"workflow_run.failure",
		"workflow_run.cancelled",
		"workflow_run.any",
	]),
	actor: triggerActorSchema,
});

/**
 * Comments filter on two independent people — who wrote the comment, and who
 * opened the thing it is on — plus an optional pattern over the body.
 */
const githubCommentEvent = z.object({
	...githubCommon,
	event: z.enum(["comment_added", "issue_comment"]),
	actor: triggerActorSchema,
	subjectAuthor: triggerActorSchema,
	commentFilter: textFilterSchema.nullable().default(null),
});

export const githubTriggerConfigSchema = z.union([
	githubSimpleEvent,
	githubCommentEvent,
]);

export const scheduleTriggerConfigSchema = z.object({
	kind: z.literal("schedule"),
	rrule,
	dtstart: z.string().datetime(),
	timezone: iana,
});

export const webhookTriggerConfigSchema = z.object({
	kind: z.literal("webhook"),
});

export const slackTriggerEventValues = [
	"message_in_channel",
	"reaction_added",
	"channel_created",
] as const;

export const slackTriggerConfigSchema = z.object({
	kind: z.literal("slack"),
	event: z.enum(slackTriggerEventValues),
	channels: triggerScopeSchema,
	// Only meaningful for reaction_added; null elsewhere.
	emoji: triggerScopeSchema,
	actor: triggerActorSchema,
	messageFilter: textFilterSchema.nullable().default(null),
});

export const linearTriggerEventValues = [
	"issue.created",
	"issue.status_changed",
	"cycle.ended",
] as const;

export const linearTriggerConfigSchema = z.object({
	kind: z.literal("linear"),
	event: z.enum(linearTriggerEventValues),
	teams: triggerScopeSchema,
	projects: triggerScopeSchema,
});

export const sentryTriggerEventValues = [
	"issue.created",
	"issue.resolved",
	"issue.assigned",
	"issue.archived",
	"issue.unresolved",
	"issue.any",
] as const;

export const sentryTriggerConfigSchema = z.object({
	kind: z.literal("sentry"),
	event: z.enum(sentryTriggerEventValues),
	projects: triggerScopeSchema,
	level: triggerScopeSchema,
});

/**
 * Structurally valid — the shape is right, but a scope may still select nothing.
 * This is what the editor holds while someone is still filling a trigger in.
 */
export const draftTriggerSchema = z.object({
	// Absent on a row that has not been saved yet. Present rows keep their id so
	// a save updates in place rather than deleting and recreating, which would
	// otherwise roll a webhook trigger's key and lose a schedule's next run.
	id: z.string().uuid().optional(),
	enabled: z.boolean().default(true),
	config: z.union([
		scheduleTriggerConfigSchema,
		webhookTriggerConfigSchema,
		githubTriggerConfigSchema,
		slackTriggerConfigSchema,
		linearTriggerConfigSchema,
		sentryTriggerConfigSchema,
	]),
});
export type DraftTrigger = z.infer<typeof draftTriggerSchema>;
export type TriggerConfigInput = DraftTrigger["config"];

/** One problem, addressed to a specific trigger so the form can mark that row. */
export type TriggerProblem = {
	index: number;
	field: string;
	message: string;
};

/**
 * The rules a draft must satisfy before it can be saved. Kept as explicit checks
 * rather than schema refinements so each one carries a message the form can put
 * next to the field it belongs to.
 */
export function describeTriggerProblems(
	triggers: DraftTrigger[],
): TriggerProblem[] {
	const problems: TriggerProblem[] = [];
	const add = (index: number, field: string, message: string) =>
		problems.push({ index, field, message });

	if (triggers.length === 0) {
		add(-1, "triggers", "Add at least one trigger.");
	}

	// A partial unique index enforces this in the database; catching it here
	// turns a save-time constraint violation into a message next to the row.
	const scheduleIndexes = triggers.flatMap((t, i) =>
		t.config.kind === "schedule" ? [i] : [],
	);
	for (const index of scheduleIndexes.slice(1)) {
		add(index, "config", "An automation can only have one schedule.");
	}

	triggers.forEach((trigger, index) => {
		const config = trigger.config;
		switch (config.kind) {
			case "github": {
				if (isEmptyScope(config.repositories)) {
					add(index, "repositories", "Specify at least one repository.");
				}
				if (isEmptyActor(config.actor)) {
					add(index, "actor", "Specify at least one person, or choose Anyone.");
				}
				if ("subjectAuthor" in config && isEmptyActor(config.subjectAuthor)) {
					add(
						index,
						"subjectAuthor",
						"Specify at least one person, or choose Anyone.",
					);
				}
				break;
			}
			case "slack": {
				if (isEmptyScope(config.channels)) {
					add(index, "channels", "Specify at least one channel.");
				}
				if (config.event === "reaction_added" && isEmptyScope(config.emoji)) {
					add(index, "emoji", "Specify at least one reaction.");
				}
				break;
			}
			case "linear":
			case "sentry":
				break;
			case "schedule":
			case "webhook":
				break;
		}
	});

	return problems;
}

/** The banner shown above the trigger list, or null when there is nothing wrong. */
export function summarizeTriggerProblems(
	problems: TriggerProblem[],
): string | null {
	if (problems.length === 0) return null;
	const missingTriggers = problems.find((p) => p.field === "triggers");
	if (missingTriggers) return missingTriggers.message;
	return "Some triggers need additional configuration";
}
