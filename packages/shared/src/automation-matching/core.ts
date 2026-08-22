import type { TriggerScope } from "../automation-triggers";

/**
 * Decides whether a recorded event satisfies a trigger's config.
 *
 * Pure and provider-shaped rather than payload-shaped: it takes the normalized
 * fields `automation_events` already carries, so the same function can be run
 * over historical rows to see what *would* have matched before anything is
 * allowed to dispatch.
 */

/**
 * The fields every provider's event carries. A provider's own event type
 * extends this with what its filters compare against — see
 * `GithubMatchableEvent`. Matchers receive their provider's type, never this
 * base; the `provider` discriminant is what narrows the union in
 * `triggerMatches`.
 */
export type BaseMatchableEvent = {
	provider: string;
	/** Qualified with its action, e.g. `pull_request.opened`. */
	eventType: string;
	/** The provider's id for whoever caused the event; what people filters compare against. */
	actorId: string | null;
	/** Display only — a handle can be renamed, the id cannot. */
	actorLogin: string | null;
	/** Comment, message, or review body when the event carries one. */
	body: string | null;
};

export type MatchResult =
	| { matches: true }
	| { matches: false; reason: string };

/** The non-match every matcher builds its refusals from. */
export const no = (reason: string): MatchResult => ({ matches: false, reason });

/**
 * An empty list matches nothing — an unconfigured filter should never fire.
 * That is the opposite of the usual "empty means unrestricted" convention, and
 * deliberate: a half-built trigger silently matching every repository is the
 * worst available failure. `{mode:"any"}` is how wide open is said.
 */
export function scopeAllows(
	scope: TriggerScope,
	value: string | null,
): boolean {
	if (scope.mode === "any") return true;
	if (value === null) return false;
	return scope.ids.includes(value);
}

/** Same, over the event's list of values — labels, attendees. */
export function scopeAllowsAny(scope: TriggerScope, values: string[]): boolean {
	if (scope.mode === "any") return true;
	return values.some((v) => scope.ids.includes(v));
}

/**
 * The body a filter is tested against is truncated first.
 *
 * A user-supplied pattern runs on the webhook path, and JavaScript's engine
 * backtracks: `^(a+)+$` against a long non-matching body is exponential and
 * would block the event loop. Truncation bounds the exponent; it does not
 * remove it, which is why a linear-time engine is still wanted here.
 */
const MAX_FILTERED_BODY = 4096;

/** Applies a comment filter, treating an invalid regex as no match. */
export function bodyMatches(
	filter: { pattern: string; isRegex: boolean } | null,
	body: string | null,
): boolean {
	if (!filter || filter.pattern === "") return true;
	if (body === null) return false;
	const subject = body.slice(0, MAX_FILTERED_BODY);
	if (!filter.isRegex) {
		return subject.toLowerCase().includes(filter.pattern.toLowerCase());
	}
	try {
		return new RegExp(filter.pattern, "i").test(subject);
	} catch {
		// A trigger whose regex does not compile must not match everything.
		return false;
	}
}
