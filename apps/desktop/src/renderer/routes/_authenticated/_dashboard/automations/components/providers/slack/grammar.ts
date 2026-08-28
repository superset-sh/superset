import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type {
	SlackTriggerEvent,
	TriggerConfigInput,
} from "@superset/shared/automation-triggers";
import type { TriggerMenuEntry } from "../types";

export type SlackConfig = Extract<TriggerConfigInput, { kind: "slack" }>;

/**
 * The sentence a Slack trigger reads as. Same shape as GitHub's grammar: the
 * words and slots per event, so the row renders one way and every event
 * describes itself.
 */

export type Slot =
	| "channels"
	| "emoji"
	| "actor"
	| "messageFilter"
	| "topLevelOnly"
	| "completionReaction";

export type SentencePart = { text: string } | { slot: Slot };

export const SLACK_SENTENCES: Record<SlackTriggerEvent, SentencePart[]> = {
	message_in_channel: [
		{ text: "Message" },
		{ slot: "messageFilter" },
		{ text: "in" },
		{ slot: "channels" },
		{ text: "by" },
		{ slot: "actor" },
		{ slot: "topLevelOnly" },
		{ text: "; react with" },
		{ slot: "completionReaction" },
		{ text: "upon completion" },
	],
	reaction_added: [
		{ text: "Reaction" },
		{ slot: "emoji" },
		{ text: "on a message in" },
		{ slot: "channels" },
		{ text: "by" },
		{ slot: "actor" },
	],
	channel_created: [{ text: "Channel created" }, { slot: "messageFilter" }],
};

export const SLACK_MENU: TriggerMenuEntry<SlackConfig>[] = [
	leaf(
		msg({
			id: "dashboard.automations.providers.slack.menuMessageInChannel",
			message: "Message in channel",
		}),
		"message_in_channel",
	),
	leaf(
		msg({
			id: "dashboard.automations.providers.slack.menuReactionAdded",
			message: "Reaction added",
		}),
		"reaction_added",
	),
	leaf(
		msg({
			id: "dashboard.automations.providers.slack.menuChannelCreated",
			message: "Channel created",
		}),
		"channel_created",
	),
];

function leaf(label: MessageDescriptor, event: SlackTriggerEvent) {
	return { label, create: () => createSlackConfig(event) };
}

/**
 * A new trigger of this event: the channel still to be chosen, every optional
 * filter wide open.
 */
export function createSlackConfig(event: SlackTriggerEvent): SlackConfig {
	return {
		kind: "slack",
		event,
		// An empty list matches nothing, which is the safety property for
		// channels: an unfinished trigger must not fire on every channel, and
		// the form refuses to save until one is chosen. A created channel is not
		// "in" one, so that event has no channel to choose and stays wide open.
		channels:
			event === "channel_created" ? { mode: "any" } : { mode: "list", ids: [] },
		// The reaction is an optional narrowing, so it starts at "any" — an
		// empty list would render as "Any reaction" while matching nothing.
		emoji: { mode: "any" },
		actor: { mode: "any" },
		messageFilter: null,
		// A busy thread would otherwise fire once per reply.
		topLevelOnly: true,
		// The message trigger acknowledges the post it ran for; the others have
		// no single message to react to.
		completionReaction:
			event === "message_in_channel" ? "white_check_mark" : null,
	};
}
