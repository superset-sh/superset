import type { SlackTriggerEvent, TriggerScope } from "../automation-triggers";
import {
	type BaseMatchableEvent,
	bodyMatches,
	type MatchResult,
	no,
	scopeAllows,
} from "./core";

/**
 * A normalized Slack event: the shared columns plus what Slack triggers
 * filter on. `body` is the message text, or the channel name for
 * channel_created.
 */
export type SlackMatchableEvent = BaseMatchableEvent & {
	provider: "slack";
	/** Where the message or reaction happened; null for channel_created. */
	channelId: string | null;
	/** The reaction's emoji name, without a skin-tone suffix; null otherwise. */
	reaction: string | null;
	/** A message posted inside a thread rather than at the top level. */
	isThreadReply: boolean;
	/** The product-level names this delivery maps to; see slackEventNames. */
	names: SlackTriggerEvent[];
};

/**
 * One spelling of an emoji name for both sides of an emoji filter: `bug`,
 * `:bug:` and `bug::skin-tone-2` (how a skin-toned reaction arrives) all read
 * as `bug`. Only the single wrapping pair comes off — a colon that is part of
 * the name itself stays. Slack emoji names are case-insensitive.
 */
export function slackEmojiName(raw: string): string {
	const bare = raw.trim().replace(/^:/, "").replace(/:$/, "");
	return (bare.split("::")[0] ?? bare).toLowerCase();
}

/**
 * Maps a Slack event type to the event a trigger names. Only `message` differs
 * from its wire name; the route has already dropped DMs and edits before it
 * gets here, so a `message` that arrives is a message in a channel.
 */
export function slackEventNames(eventType: string): SlackTriggerEvent[] {
	switch (eventType) {
		case "message":
			return ["message_in_channel"];
		case "reaction_added":
			return ["reaction_added"];
		case "channel_created":
			return ["channel_created"];
		default:
			return [];
	}
}

/** Whether a Slack trigger config accepts this event. */
export function slackTriggerMatches(
	config: {
		event: string;
		channels: TriggerScope;
		emoji: TriggerScope;
		actor: TriggerScope;
		messageFilter?: { pattern: string; isRegex: boolean } | null;
	},
	event: SlackMatchableEvent,
): MatchResult {
	if (!event.names.includes(config.event as SlackTriggerEvent)) {
		return no("event");
	}
	// A created channel is not "in" a channel, so the scope has nothing to say.
	if (
		config.event !== "channel_created" &&
		!scopeAllows(config.channels, event.channelId)
	) {
		return no("channel");
	}
	// Configs saved before the editor normalized names may still hold `:Bug:`.
	if (
		config.event === "reaction_added" &&
		!scopeAllows(
			config.emoji.mode === "list"
				? { ...config.emoji, ids: config.emoji.ids.map(slackEmojiName) }
				: config.emoji,
			event.reaction,
		)
	) {
		return no("emoji");
	}
	// Thread replies never fire message triggers — a busy thread would
	// otherwise fire once per reply.
	if (config.event === "message_in_channel" && event.isThreadReply) {
		return no("threadReply");
	}
	if (!scopeAllows(config.actor, event.actorId)) {
		return no("actor");
	}
	if (!bodyMatches(config.messageFilter ?? null, event.body)) {
		return no("messageFilter");
	}
	return { matches: true };
}
