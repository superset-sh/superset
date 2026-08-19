import type { SentryTriggerEvent, TriggerScope } from "../automation-triggers";
import {
	type BaseMatchableEvent,
	type MatchResult,
	no,
	scopeAllows,
} from "./core";

/** A Sentry issue webhook, normalized to what Sentry triggers filter on. */
export type SentryMatchableEvent = BaseMatchableEvent & {
	provider: "sentry";
	/** Sentry's numeric project id, as a string. */
	projectId: string | null;
	/** fatal / error / warning / info / debug. */
	level: string | null;
	/** The product-level names this delivery maps to; see sentryEventNames. */
	names: SentryTriggerEvent[];
};

/**
 * Maps a Sentry issue webhook to the events a trigger can name. The wire event
 * is `issue.<action>`; every one of them also satisfies `issue.any`.
 */
export function sentryEventNames(eventType: string): SentryTriggerEvent[] {
	switch (eventType) {
		case "issue.created":
		case "issue.resolved":
		case "issue.assigned":
		case "issue.archived":
		case "issue.unresolved":
			return [eventType, "issue.any"];
		// Sentry's older wire name for Archive; both spellings still arrive.
		case "issue.ignored":
			return ["issue.archived", "issue.any"];
		default:
			return [];
	}
}

/** Whether a Sentry trigger config accepts this event. */
export function sentryTriggerMatches(
	config: {
		event: string;
		projects: TriggerScope;
		level: TriggerScope;
	},
	event: SentryMatchableEvent,
): MatchResult {
	if (!event.names.includes(config.event as SentryTriggerEvent)) {
		return no("event");
	}
	if (!scopeAllows(config.projects, event.projectId)) {
		return no("project");
	}
	if (!scopeAllows(config.level, event.level)) {
		return no("level");
	}
	return { matches: true };
}
