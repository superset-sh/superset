import type { TextFilter, TriggerScope } from "../automation-triggers";
import {
	type BaseMatchableEvent,
	bodyMatches,
	type MatchResult,
	no,
	scopeAllowsAny,
} from "./core";

/**
 * A Circleback meeting, normalized to what Circleback triggers filter on.
 * Every value here is typed by a person on one side and by Circleback on the
 * other, so comparison is case-insensitive: "events" and "Events" are the same
 * tag, and an email is an email whatever its case.
 */
export type CirclebackMatchableEvent = BaseMatchableEvent & {
	provider: "circleback";
	name: string | null;
	tags: string[];
	attendeeEmails: string[];
};

function lower(values: string[]): string[] {
	return values.map((v) => v.trim().toLowerCase());
}

/** `scopeAllowsAny`, with both sides folded to one case first. */
function narrows(scope: TriggerScope, values: string[]): boolean {
	if (scope.mode === "any") return true;
	return scopeAllowsAny({ mode: "list", ids: lower(scope.ids) }, lower(values));
}

/** Whether a Circleback trigger config accepts this meeting. */
export function circlebackTriggerMatches(
	config: {
		event: string;
		tags: TriggerScope;
		attendees: TriggerScope;
		nameFilter?: TextFilter | null;
	},
	event: CirclebackMatchableEvent,
): MatchResult {
	if (config.event !== event.eventType) return no("event");
	if (!narrows(config.tags, event.tags)) return no("tags");
	if (!narrows(config.attendees, event.attendeeEmails)) return no("attendees");
	if (!bodyMatches(config.nameFilter ?? null, event.name)) {
		return no("nameFilter");
	}
	return { matches: true };
}
