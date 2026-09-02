import { z } from "zod";
import { i18n } from "./i18n";
import { hasFiniteRecurrence, rruleProblem } from "./rrule";

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
 * Tagged rather than inferred from shape: `{mode:"any"}` matches everything, a
 * list matches those ids, and an empty list matches nothing — the "Select
 * Repos" state a half-built trigger sits in. Every id space here is
 * user-controlled — a GitHub label really can be named "any" — so a bare
 * `string[] | "any"` would collide with legal values. People filters (actor,
 * assignee, attendee) are scopes too; the ids are whatever the provider names
 * people by.
 */
export const triggerScopeSchema = z
	.union([
		z.object({ mode: z.literal("any") }),
		z.object({
			mode: z.literal("list"),
			ids: z.array(z.string().min(1)).max(200),
		}),
		// The automation owner's own identity at the provider, resolved when the
		// event arrives rather than when the trigger was written — reconnecting
		// a different account moves the trigger with it. People pickers offer it;
		// on any other scope it resolves to the same id and matches nothing.
		z.object({ mode: z.literal("me") }),
	])
	.default({ mode: "any" });
export type TriggerScope = z.infer<typeof triggerScopeSchema>;

/** A scope that is set but selects nothing — the "Select Repos" empty state. */
export function isEmptyScope(scope: TriggerScope): boolean {
	return scope.mode === "list" && scope.ids.length === 0;
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
	actor: triggerScopeSchema,
});

/**
 * Comments filter on two independent people — who wrote the comment, and who
 * opened the thing it is on — plus an optional pattern over the body.
 */
const githubCommentEvent = z.object({
	...githubCommon,
	event: z.enum(["comment_added", "issue_comment"]),
	actor: triggerScopeSchema,
	subjectAuthor: triggerScopeSchema,
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
export type SlackTriggerEvent = (typeof slackTriggerEventValues)[number];

/** An emoji short name as Slack sends it: `bug`, `white_check_mark`, `+1`. */
const slackEmojiName = z.string().min(1).max(100);

export const slackTriggerConfigSchema = z.object({
	kind: z.literal("slack"),
	event: z.enum(slackTriggerEventValues),
	// The channel a message or reaction lands in. Not meaningful for
	// channel_created — the channel does not exist yet — so "any" there.
	channels: triggerScopeSchema,
	// Only meaningful for reaction_added; "any" elsewhere. The ids are emoji
	// short names typed by the person, so a workspace's custom emoji work
	// without any list of them existing.
	emoji: triggerScopeSchema,
	actor: triggerScopeSchema,
	// A pattern over the message text, or over the channel name for
	// channel_created.
	messageFilter: textFilterSchema.nullable().default(null),
	// message_in_channel only: the reaction to add to the triggering message
	// when the run completes; null for none.
	completionReaction: slackEmojiName.nullable().default("white_check_mark"),
});

export const linearTriggerEventValues = [
	"issue.created",
	"issue.status_changed",
	"issue.assigned",
	"cycle.ended",
] as const;
export type LinearTriggerEvent = (typeof linearTriggerEventValues)[number];

/**
 * One flat shape for every Linear event. Filters an event has no use for —
 * labels on a cycle — sit at "any" and never narrow.
 */
export const linearTriggerConfigSchema = z.object({
	kind: z.literal("linear"),
	event: z.enum(linearTriggerEventValues),
	teams: triggerScopeSchema,
	projects: triggerScopeSchema,
	labels: triggerScopeSchema,
	// Workflow state ids the issue moved into. Only meaningful for
	// issue.status_changed; "any" elsewhere.
	toStatus: triggerScopeSchema,
	// The issue's assignee, not who made the change. Ids are Linear user ids.
	assignee: triggerScopeSchema,
});

export const sentryTriggerEventValues = [
	"issue.created",
	"issue.resolved",
	"issue.assigned",
	"issue.archived",
	"issue.unresolved",
	"issue.any",
] as const;
export type SentryTriggerEvent = (typeof sentryTriggerEventValues)[number];

export const sentryTriggerConfigSchema = z.object({
	kind: z.literal("sentry"),
	event: z.enum(sentryTriggerEventValues),
	// Sentry's numeric project ids: a slug can be renamed, the id cannot.
	projects: triggerScopeSchema,
	// Optional narrowing over fatal/error/warning/info/debug; "any" by default.
	level: triggerScopeSchema,
});

/**
 * Notion. `comment.mentioned` is not a Notion event: it is `comment.created`
 * narrowed to comments whose rich text mentions a user, which the webhook
 * route works out after fetching the comment.
 */
export const notionTriggerEventValues = [
	"data_source.content_updated",
	"comment.created",
	"comment.mentioned",
] as const;
export type NotionTriggerEvent = (typeof notionTriggerEventValues)[number];

const notionCommon = {
	kind: z.literal("notion"),
	dataSources: triggerScopeSchema,
};

const notionContentUpdatedEvent = z.object({
	...notionCommon,
	event: z.literal("data_source.content_updated"),
});

/**
 * Comments live on a page, which may itself be a row of a data source, so
 * both narrow: the data source the page belongs to and the page itself.
 */
const notionCommentCreatedEvent = z.object({
	...notionCommon,
	event: z.literal("comment.created"),
	pages: triggerScopeSchema,
	actor: triggerScopeSchema,
});

const notionCommentMentionedEvent = z.object({
	...notionCommon,
	event: z.literal("comment.mentioned"),
	pages: triggerScopeSchema,
	// Who has to be @-mentioned for the comment to count; "any" fires on any
	// comment that mentions somebody.
	mentionedUser: triggerScopeSchema,
});

export const notionTriggerConfigSchema = z.union([
	notionContentUpdatedEvent,
	notionCommentCreatedEvent,
	notionCommentMentionedEvent,
]);

export const microsoftTeamsTriggerEventValues = [
	"message_in_channel",
	"channel_created",
] as const;
export type MicrosoftTeamsTriggerEvent =
	(typeof microsoftTeamsTriggerEventValues)[number];

/**
 * Teams triggers scope by team, then by channel within it. `channel_created`
 * has no channel to filter on — the channel is the thing being created — so it
 * carries `channels: {mode:"any"}` and reads `messageFilter` as a pattern over
 * the new channel's name.
 */
export const microsoftTeamsTriggerConfigSchema = z.object({
	kind: z.literal("microsoft_teams"),
	event: z.enum(microsoftTeamsTriggerEventValues),
	teams: triggerScopeSchema,
	// Only meaningful for message_in_channel; "any" elsewhere.
	channels: triggerScopeSchema,
	// Only meaningful for message_in_channel; "any" elsewhere.
	actor: triggerScopeSchema,
	messageFilter: textFilterSchema.nullable().default(null),
});

/**
 * Google Calendar events carry different filters, so the config is a union on
 * the event: a change carries the external-attendee narrowing, a starting-soon
 * fire carries how far ahead it fires, and a cancellation carries neither.
 */
export const googleCalendarTriggerEventValues = [
	"event.created",
	"event.updated",
	"event.cancelled",
	"event.starting_soon",
	"event.ended",
] as const;
export type GoogleCalendarTriggerEvent =
	(typeof googleCalendarTriggerEventValues)[number];

const googleCalendarCommon = {
	kind: z.literal("google_calendar"),
	calendars: triggerScopeSchema,
	// Anyone on the event: organizer, creator or invitee. Ids are email
	// addresses, since that is what a calendar event names people by.
	attendee: triggerScopeSchema,
	titleFilter: textFilterSchema.nullable().default(null),
};

const googleCalendarChangeEvent = z.object({
	...googleCalendarCommon,
	event: z.enum(["event.created", "event.updated"]),
	// A boolean rather than a scope: false is "do not narrow", true requires
	// someone from outside the connected account's domain to be on the event.
	hasExternalAttendee: z.boolean().default(false),
});

const googleCalendarStartingSoonEvent = z.object({
	...googleCalendarCommon,
	event: z.literal("event.starting_soon"),
	minutesBefore: z.number().int().min(1).max(1440).default(15),
});

const googleCalendarSimpleEvent = z.object({
	...googleCalendarCommon,
	event: z.enum(["event.cancelled", "event.ended"]),
});

export const googleCalendarTriggerConfigSchema = z.union([
	googleCalendarChangeEvent,
	googleCalendarStartingSoonEvent,
	googleCalendarSimpleEvent,
]);

export const gmailTriggerEventValues = ["message.received"] as const;
export type GmailTriggerEvent = (typeof gmailTriggerEventValues)[number];

export const gmailTriggerConfigSchema = z.object({
	kind: z.literal("gmail"),
	event: z.enum(gmailTriggerEventValues),
	// Addresses or bare domains ("acme.com"), free-form: a sender is not a
	// pickable value the way a channel is.
	from: triggerScopeSchema,
	to: triggerScopeSchema,
	subjectFilter: textFilterSchema.nullable().default(null),
	// Gmail label ids, not names: a label can be renamed, its id cannot.
	labels: triggerScopeSchema,
	hasAttachment: z.boolean().default(false),
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
	config: z.union([
		scheduleTriggerConfigSchema,
		webhookTriggerConfigSchema,
		githubTriggerConfigSchema,
		slackTriggerConfigSchema,
		linearTriggerConfigSchema,
		sentryTriggerConfigSchema,
		notionTriggerConfigSchema,
		microsoftTeamsTriggerConfigSchema,
		googleCalendarTriggerConfigSchema,
		gmailTriggerConfigSchema,
	]),
});
export type DraftTrigger = z.infer<typeof draftTriggerSchema>;
export type TriggerConfigInput = DraftTrigger["config"];

/**
 * The trigger kinds the AUTOMATION_EVENT_TRIGGERS flag payload enables. Off,
 * unloaded, offline, or a payload that isn't an array all mean none — Scheduled
 * is offered regardless and is then the only kind. Strings, not kinds: the
 * payload is edited by hand in PostHog, and an unknown entry simply enables
 * nothing.
 */
export function enabledTriggerKinds(payload: unknown): Set<string> {
	return new Set(
		Array.isArray(payload)
			? payload.filter((kind): kind is string => typeof kind === "string")
			: [],
	);
}

/** One problem, addressed to a specific trigger so the form can mark that row. */
export type TriggerProblem = {
	index: number;
	field: string;
	message: string;
};

/**
 * One "Specify at least one …" rule: the scope field that must not be empty,
 * the noun the message names it by, and — for fields whose chip offers an
 * explicit wide-open entry — what that entry is called. `when` limits the rule
 * to the events whose sentence shows the chip; a rule for a field the config
 * member does not carry skips itself.
 */
type ScopeNoun =
	| "repository"
	| "person"
	| "channel"
	| "reaction"
	| "dataSource"
	| "team"
	| "project"
	| "calendar"
	| "sender";

type ScopeChoice = "anyone" | "anySender";

type ScopeRequirement = {
	field: string;
	noun: ScopeNoun;
	orChoose?: ScopeChoice;
	when?: (config: TriggerConfigInput) => boolean;
};

function scopeChoiceLabel(choice: ScopeChoice): string {
	switch (choice) {
		case "anyone":
			return i18n._({
				id: "shared.automationTriggers.choice.anyone",
				message: "Anyone",
			});
		case "anySender":
			return i18n._({
				id: "shared.automationTriggers.choice.anySender",
				message: "Any sender",
			});
	}
}

const person = (
	field: string,
	when?: (config: TriggerConfigInput) => boolean,
): ScopeRequirement => ({ field, noun: "person", orChoose: "anyone", when });

const REQUIREMENTS: Partial<
	Record<TriggerConfigInput["kind"], ScopeRequirement[]>
> = {
	github: [
		{ field: "repositories", noun: "repository" },
		person("actor"),
		person("subjectAuthor"),
	],
	slack: [
		{
			field: "channels",
			noun: "channel",
			when: (config) =>
				config.kind === "slack" && config.event !== "channel_created",
		},
		{
			field: "emoji",
			noun: "reaction",
			when: (config) =>
				config.kind === "slack" && config.event === "reaction_added",
		},
		person("actor"),
	],
	notion: [
		{ field: "dataSources", noun: "dataSource" },
		person("actor"),
		person("mentionedUser"),
	],
	linear: [
		{ field: "teams", noun: "team" },
		// Only the events whose sentence shows an assignee; a created or cycle
		// trigger has no chip to clear such a problem with.
		person(
			"assignee",
			(config) =>
				config.kind === "linear" &&
				(config.event === "issue.status_changed" ||
					config.event === "issue.assigned"),
		),
	],
	microsoft_teams: [
		{ field: "teams", noun: "team" },
		{
			field: "channels",
			noun: "channel",
			when: (config) =>
				config.kind === "microsoft_teams" &&
				config.event === "message_in_channel",
		},
		person("actor"),
	],
	sentry: [{ field: "projects", noun: "project" }],
	google_calendar: [
		{ field: "calendars", noun: "calendar" },
		person("attendee"),
	],
	// The sender is the primary scope, as the repository is for GitHub: a
	// mailbox-wide trigger has to be chosen ("Any sender"), never arrived at by
	// leaving the chip empty.
	gmail: [{ field: "from", noun: "sender", orChoose: "anySender" }],
};

/**
 * The rules a draft must satisfy before it can be saved. A data table plus one
 * loop rather than schema refinements, so each rule carries a message the form
 * can put next to the field it belongs to — and so the draft/savable split
 * survives: the schema stays satisfiable by a half-configured trigger.
 */
export function describeTriggerProblems(
	triggers: DraftTrigger[],
): TriggerProblem[] {
	// An empty set is legal: an automation starts untitled with no triggers
	// and simply never fires until one is added.
	const problems: TriggerProblem[] = [];

	triggers.forEach((trigger, index) => {
		const config = trigger.config;
		for (const rule of REQUIREMENTS[config.kind] ?? []) {
			if (rule.when && !rule.when(config)) continue;
			const scope = (config as Record<string, unknown>)[rule.field] as
				| TriggerScope
				| undefined;
			if (scope === undefined || !isEmptyScope(scope)) continue;
			problems.push({
				index,
				field: rule.field,
				// The noun travels as a select key, not an interpolated label:
				// "at least one {noun}" needs an article and case that agree with
				// the noun, which no language with grammatical gender can produce
				// from a placeholder. Each locale inflects every branch itself.
				message: rule.orChoose
					? i18n._({
							id: "shared.automationTriggers.scopeRequiredOrChoose",
							message:
								"{noun, select, person {Specify at least one person, or choose {choice}.} sender {Specify at least one sender, or choose {choice}.} other {Specify at least one entry, or choose {choice}.}}",
							values: {
								noun: rule.noun,
								choice: scopeChoiceLabel(rule.orChoose),
							},
						})
					: i18n._({
							id: "shared.automationTriggers.scopeRequired",
							message:
								"{noun, select, repository {Specify at least one repository.} channel {Specify at least one channel.} reaction {Specify at least one reaction.} dataSource {Specify at least one data source.} team {Specify at least one team.} project {Specify at least one project.} calendar {Specify at least one calendar.} other {Specify at least one entry.}}",
							values: { noun: rule.noun },
						}),
			});
		}

		// A schedule's rule is about its recurrence, not a scope, so it stays code.
		if (config.kind === "schedule") {
			if (rruleProblem(config.rrule) === "unparseable") {
				problems.push({
					index,
					field: "rrule",
					message: i18n._({
						id: "shared.automationTriggers.invalidRrule",
						message: "Enter a valid recurrence rule.",
					}),
				});
			} else if (hasFiniteRecurrence(config.rrule)) {
				problems.push({
					index,
					field: "rrule",
					message: i18n._({
						id: "shared.automationTriggers.finiteRrule",
						message: "Schedules repeat — remove COUNT or UNTIL.",
					}),
				});
			}
		}
	});

	return problems;
}

/** The banner shown above the trigger list, or null when there is nothing wrong. */
export function summarizeTriggerProblems(
	problems: TriggerProblem[],
): string | null {
	if (problems.length === 0) return null;
	return i18n._({
		id: "shared.automationTriggers.needConfiguration",
		message: "Some triggers need additional configuration",
	});
}
