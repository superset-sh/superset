import type { TriggerActor, TriggerScope } from "../automation-triggers";

/**
 * Decides whether a recorded event satisfies a trigger's config.
 *
 * Pure and provider-shaped rather than payload-shaped: it takes the normalized
 * fields `automation_events` already carries, so the same function can be run
 * over historical rows to see what *would* have matched before anything is
 * allowed to dispatch.
 */

/** The normalized event, as recorded. */
export type MatchableEvent = {
	/** Qualified with its action, e.g. `pull_request.opened`. */
	eventType: string;
	repositoryId: string | null;
	ref: string | null;
	/** GitHub's numeric id; what people filters compare against. */
	actorId: string | null;
	/** Display only — a login can be renamed, the id cannot. */
	actorLogin: string | null;
	actorIsExternal: boolean | null;
	labels: string[];
	/** Comment or review body, when the event carries one. */
	body: string | null;
	/** Fork pull requests carry attacker-controlled content into a checkout. */
	isFork: boolean;
	/** Who opened the thing being commented on. */
	subjectAuthorId: string | null;
};

export type MatchResult =
	| { matches: true }
	| { matches: false; reason: string };

/**
 * `null` matches nothing — an unconfigured filter should never fire. That is the
 * opposite of the usual "empty means unrestricted" convention, and deliberate:
 * a half-built trigger silently matching every repository is the worst
 * available failure.
 */
export function scopeAllows(
	scope: TriggerScope,
	value: string | null,
): boolean {
	if (scope === null) return false;
	if (scope.mode === "any") return true;
	if (value === null) return false;
	return scope.ids.includes(value);
}

/** Same, but for filters that are only meaningful on some events. */
export function scopeAllowsAny(scope: TriggerScope, values: string[]): boolean {
	if (scope === null) return false;
	if (scope.mode === "any") return true;
	return values.some((v) => scope.ids.includes(v));
}

/**
 * `ownerIds` is a set: a person may link both a work and a personal account, and
 * a pull request opened from either is still theirs.
 */
export function actorAllows(
	actor: TriggerActor,
	actorId: string | null,
	ownerIds: string[],
): boolean {
	if (actor === "anyone") return true;
	if (actorId === null) return false;
	if (actor === "me") return ownerIds.includes(actorId);
	return actor.ids.includes(actorId);
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
