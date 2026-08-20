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
	leaf("Issue created", "issue.created"),
	leaf("Issue resolved", "issue.resolved"),
	leaf("Issue assigned", "issue.assigned"),
	leaf("Issue archived", "issue.archived"),
	leaf("Issue unresolved", "issue.unresolved"),
	leaf("Any issue event", "issue.any"),
];

function leaf(label: string, event: SentryTriggerEvent) {
	return { label, create: () => createSentryConfig(event) };
}

/** Sentry's fixed severity levels; the ids are what the webhook payload carries. */
export const SENTRY_LEVELS = [
	{ id: "fatal", label: "Fatal" },
	{ id: "error", label: "Error" },
	{ id: "warning", label: "Warning" },
	{ id: "info", label: "Info" },
	{ id: "debug", label: "Debug" },
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
