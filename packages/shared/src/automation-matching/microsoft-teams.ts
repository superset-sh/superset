import type {
	MicrosoftTeamsTriggerEvent,
	TriggerScope,
} from "../automation-triggers";
import {
	type BaseMatchableEvent,
	bodyMatches,
	type MatchResult,
	no,
	scopeAllows,
} from "./core";

/**
 * A Teams change notification, resolved to the resource behind it and
 * normalized to what Teams triggers filter on. `body` is the message text for
 * a message and the new channel's name for a channel.
 */
export type MicrosoftTeamsMatchableEvent = BaseMatchableEvent & {
	provider: "microsoft_teams";
	eventType: MicrosoftTeamsTriggerEvent;
	teamId: string | null;
	channelId: string | null;
};

/** Whether a Teams trigger config accepts this event. */
export function microsoftTeamsTriggerMatches(
	config: {
		event: MicrosoftTeamsTriggerEvent;
		teams: TriggerScope;
		channels: TriggerScope;
		actor: TriggerScope;
		messageFilter?: { pattern: string; isRegex: boolean } | null;
	},
	event: MicrosoftTeamsMatchableEvent,
): MatchResult {
	if (event.eventType !== config.event) return no("event");
	if (!scopeAllows(config.teams, event.teamId)) return no("team");

	// For channel_created the channel is the subject, not a filter, and nobody
	// is named as the actor: the sentence has neither slot.
	if (config.event === "message_in_channel") {
		if (!scopeAllows(config.channels, event.channelId)) return no("channel");
		if (!scopeAllows(config.actor, event.actorId)) {
			return no("actor");
		}
	}

	if (!bodyMatches(config.messageFilter ?? null, event.body)) {
		return no("messageFilter");
	}
	return { matches: true };
}
