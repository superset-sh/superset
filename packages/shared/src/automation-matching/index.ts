import type { TriggerConfigInput } from "../automation-triggers";
import type { BaseMatchableEvent, MatchResult } from "./core";
import { type GithubMatchableEvent, githubTriggerMatches } from "./github";
import {
	type GmailMatchableEvent,
	type GoogleCalendarMatchableEvent,
	gmailTriggerMatches,
	googleCalendarTriggerMatches,
} from "./google";
import { type LinearMatchableEvent, linearTriggerMatches } from "./linear";
import {
	type MicrosoftTeamsMatchableEvent,
	microsoftTeamsTriggerMatches,
} from "./microsoft-teams";
import { type NotionMatchableEvent, notionTriggerMatches } from "./notion";
import { type SentryMatchableEvent, sentryTriggerMatches } from "./sentry";
import { type SlackMatchableEvent, slackTriggerMatches } from "./slack";
import { type WebhookMatchableEvent, webhookTriggerMatches } from "./webhook";

export * from "./core";
export * from "./github";
export * from "./google";
export * from "./linear";
export * from "./microsoft-teams";
export * from "./notion";
export * from "./sentry";
export * from "./slack";
export * from "./webhook";

/**
 * Every provider's normalized event, discriminated by `provider`.
 *
 * Adding a provider: define `<Name>MatchableEvent = BaseMatchableEvent & {
 * provider: "<kind>"; …fields its filters compare against }` in its own module,
 * add it to this union, and add a `case` below. Provider-specific fields live
 * on the event — a Slack matcher must not need to know a GitHub field exists.
 */
export type MatchableEvent =
	| GithubMatchableEvent
	| WebhookMatchableEvent
	| NotionMatchableEvent
	| LinearMatchableEvent
	| SlackMatchableEvent
	| MicrosoftTeamsMatchableEvent
	| SentryMatchableEvent
	| GoogleCalendarMatchableEvent
	| GmailMatchableEvent;

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
			);
		case "sentry":
			return sentryTriggerMatches(
				config as Extract<TriggerConfigInput, { kind: "sentry" }>,
				event,
			);
		case "webhook":
			return webhookTriggerMatches();
		case "notion":
			return notionTriggerMatches(
				config as Extract<TriggerConfigInput, { kind: "notion" }>,
				event,
			);
		case "linear":
			return linearTriggerMatches(
				config as Extract<TriggerConfigInput, { kind: "linear" }>,
				event,
			);
		case "slack":
			return slackTriggerMatches(
				config as Extract<TriggerConfigInput, { kind: "slack" }>,
				event,
			);
		case "microsoft_teams":
			return microsoftTeamsTriggerMatches(
				config as Extract<TriggerConfigInput, { kind: "microsoft_teams" }>,
				event,
			);
		case "google_calendar":
			return googleCalendarTriggerMatches(
				config as Extract<TriggerConfigInput, { kind: "google_calendar" }>,
				event,
			);
		case "gmail":
			return gmailTriggerMatches(
				config as Extract<TriggerConfigInput, { kind: "gmail" }>,
				event,
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
