import type { TriggerConfigInput } from "../automation-triggers";
import type { BaseMatchableEvent, MatchContext, MatchResult } from "./core";
import { type GithubMatchableEvent, githubTriggerMatches } from "./github";

export * from "./core";
export * from "./github";

/**
 * Every provider's normalized event, discriminated by `provider`.
 *
 * Adding a provider: define `<Name>MatchableEvent = BaseMatchableEvent & {
 * provider: "<kind>"; …fields its filters compare against }` in its own module,
 * add it to this union, and add a `case` below. Provider-specific fields live
 * on the event, never on `MatchContext` — a Slack matcher must not need to
 * know that a GitHub context key exists.
 */
export type MatchableEvent = GithubMatchableEvent;

/**
 * Whether a trigger config accepts an event, whatever provider it belongs to.
 *
 * Dispatches on `config.kind` and requires the event to be from the same
 * provider — a Slack trigger never sees a GitHub event, so a mismatched pair
 * is a caller bug and is refused rather than silently matched. A kind with no
 * matcher does not match: an event arriving for a provider that cannot yet
 * evaluate it must not fire the automation by default.
 */
export function triggerMatches(
	config: TriggerConfigInput,
	event: MatchableEvent,
	context: MatchContext,
): MatchResult {
	if (config.kind !== event.provider) {
		return {
			matches: false,
			reason: `${config.kind} trigger cannot match a ${event.provider} event`,
		};
	}
	// Narrow on the event's discriminant, not the config's: with the union at
	// one member the config-side switch collapses `default` to `never`, and
	// the event is the thing that actually carries provider-shaped fields.
	switch (event.provider) {
		case "github":
			return githubTriggerMatches(
				config as Extract<TriggerConfigInput, { kind: "github" }>,
				event,
				context,
			);
	}
	// Reached only when a provider is in the union but has no case above.
	return {
		matches: false,
		reason: `no matcher for ${(event as BaseMatchableEvent).provider}`,
	};
}

/** Guard for provider modules that need the base shape without the union. */
export type { BaseMatchableEvent };
