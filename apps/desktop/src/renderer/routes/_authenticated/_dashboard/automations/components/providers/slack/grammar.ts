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
	| "completionReaction";

export type SentencePart = { text: string } | { slot: Slot };

export const SLACK_SENTENCES: Record<SlackTriggerEvent, SentencePart[]> = {
	// The filter chip is the subject — "[Any message] from [Anyone] in [#x]" —
	// rather than trailing a "Message" label it would collide with.
	message_in_channel: [
		{ slot: "messageFilter" },
		{ text: "from" },
		{ slot: "actor" },
		{ text: "in" },
		{ slot: "channels" },
		{ text: "; react with" },
		{ slot: "completionReaction" },
		{ text: "upon completion" },
	],
	// Actor beside its verb: "added by" — at the end it read as the message's
	// author rather than the reactor's.
	reaction_added: [
		{ text: "Reaction" },
		{ slot: "emoji" },
		{ text: "added by" },
		{ slot: "actor" },
		{ text: "to a message in" },
		{ slot: "channels" },
	],
	channel_created: [
		{ text: "Channel created matching" },
		{ slot: "messageFilter" },
	],
};

export const SLACK_MENU: TriggerMenuEntry<SlackConfig>[] = [
	leaf(
		msg({
			message: "Message in channel",
		}),
		"message_in_channel",
	),
	leaf(
		msg({
			message: "Reaction added",
		}),
		"reaction_added",
	),
	leaf(
		msg({
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
		// A reaction trigger names its reaction — the empty list refuses to save
		// until one is typed, same as channels. Elsewhere the field is unused
		// and stays wide open.
		emoji:
			event === "reaction_added" ? { mode: "list", ids: [] } : { mode: "any" },
		actor: { mode: "any" },
		messageFilter: null,
		// The message trigger acknowledges the post it ran for; the others have
		// no single message to react to.
		completionReaction:
			event === "message_in_channel" ? "white_check_mark" : null,
	};
}
