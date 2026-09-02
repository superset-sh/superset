import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type {
	SentryTriggerEvent,
	TriggerConfigInput,
} from "@superset/shared/automation-triggers";
import type { TriggerMenuEntry } from "../types";

export type SentryConfig = Extract<TriggerConfigInput, { kind: "sentry" }>;

/**
 * The sentence a Sentry trigger reads as. Every event carries the same two
 * slots — which projects, and which levels — so the grammar only varies in
 * its opening words.
 */

export type Slot = "projects" | "level";

export type SentencePart = { text: string } | { slot: Slot };

function sentence(opening: string): SentencePart[] {
	return [
		{ text: opening },
		{ slot: "projects" },
		{ text: "with level" },
		{ slot: "level" },
	];
}

export const SENTRY_SENTENCES: Record<SentryTriggerEvent, SentencePart[]> = {
	"issue.created": sentence("Sentry issue created in"),
	"issue.resolved": sentence("Sentry issue resolved in"),
	"issue.assigned": sentence("Sentry issue assigned in"),
	"issue.archived": sentence("Sentry issue archived in"),
	"issue.unresolved": sentence("Sentry issue unresolved in"),
	"issue.any": sentence("Any Sentry issue event in"),
};

export const SENTRY_MENU: TriggerMenuEntry<SentryConfig>[] = [
	leaf(
		msg({
			message: "Issue created",
		}),
		"issue.created",
	),
	leaf(
		msg({
			message: "Issue resolved",
		}),
		"issue.resolved",
	),
	leaf(
		msg({
			message: "Issue assigned",
		}),
		"issue.assigned",
	),
	leaf(
		msg({
			message: "Issue archived",
		}),
		"issue.archived",
	),
	leaf(
		msg({
			message: "Issue unresolved",
		}),
		"issue.unresolved",
	),
	leaf(
		msg({
			message: "Any issue event",
		}),
		"issue.any",
	),
];

function leaf(label: MessageDescriptor, event: SentryTriggerEvent) {
	return { label, create: () => createSentryConfig(event) };
}

/** Sentry's fixed severity levels; the ids are what the webhook payload carries. */
export const SENTRY_LEVELS: { id: string; label: MessageDescriptor }[] = [
	{
		id: "fatal",
		label: msg({
			message: "Fatal",
		}),
	},
	{
		id: "error",
		label: msg({
			message: "Error",
		}),
	},
	{
		id: "warning",
		label: msg({
			message: "Warning",
		}),
	},
	{
		id: "info",
		label: msg({
			message: "Info",
		}),
	},
	{
		id: "debug",
		label: msg({
			message: "Debug",
		}),
	},
];

/**
 * A new trigger of this event: the project still to be chosen, the level
 * filter wide open.
 */
export function createSentryConfig(event: SentryTriggerEvent): SentryConfig {
	return {
		kind: "sentry",
		event,
		// An empty list matches nothing: an unfinished trigger must not fire on
		// every project, and the form refuses to save until one is chosen.
		projects: { mode: "list", ids: [] },
		// An optional narrowing, so it starts at "any" — shown or not.
		level: { mode: "any" },
	};
}
