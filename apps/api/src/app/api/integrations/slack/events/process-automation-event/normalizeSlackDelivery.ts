import type {
	BotMessageEvent,
	ChannelCreatedEvent,
	FileShareMessageEvent,
	GenericMessageEvent,
	MessageEvent,
	ReactionAddedEvent,
	ThreadBroadcastMessageEvent,
} from "@slack/types";
import {
	type SlackMatchableEvent,
	slackEmojiName,
	slackEventNames,
} from "@superset/shared/automation-matching";

import type { NormalizedDelivery } from "@/lib/automations/ingestAutomationEvent";

/**
 * The message subtypes that are still "a message in the channel". Edits,
 * deletes, joins and topic changes are also delivered as `message` events and
 * are not.
 */
export type ChannelMessageEvent =
	| GenericMessageEvent
	| BotMessageEvent
	| FileShareMessageEvent
	| ThreadBroadcastMessageEvent;

/**
 * The three Slack events triggers can name, and the envelope they arrive in.
 * The envelope's `authorizations` names the bot user the event was delivered
 * for, which is how the bot's own messages are recognised without a lookup.
 */
export type SlackAutomationEvent =
	| ChannelMessageEvent
	| ReactionAddedEvent
	| ChannelCreatedEvent;

export type SlackAutomationEnvelope = {
	team_id: string;
	event_id: string;
	api_app_id?: string;
	authorizations?: Array<{ user_id?: string; is_bot?: boolean }>;
	event: SlackAutomationEvent;
};

/**
 * A Slack event flattened out of payloads whose shape differs per event: the
 * matchable event triggers filter on, plus what the `automation_events` row
 * needs beyond that.
 */
type NormalizedSlackEvent = {
	event: SlackMatchableEvent;
	resourceKey: string;
	title: string;
	url: string;
};

const MESSAGE_SUBTYPES = new Set<string | undefined>([
	undefined,
	"bot_message",
	"file_share",
	"thread_broadcast",
]);

type OwnBotEnvelope = Pick<
	SlackAutomationEnvelope,
	"api_app_id" | "authorizations"
>;

/**
 * The bot user ids this delivery was authorized for. Slack omits `is_bot` on
 * some deliveries; only an explicit `false` marks the authorization as a
 * person's user token rather than the bot's.
 */
function ownBotUserIds(envelope: OwnBotEnvelope): string[] {
	return (envelope.authorizations ?? [])
		.filter((a) => a.is_bot !== false)
		.map((a) => a.user_id)
		.filter((id): id is string => typeof id === "string");
}

/**
 * Whether a message event is one triggers should see: posted in a channel
 * (public or private, not a DM), a real post rather than an edit, and not
 * written by this app's own bot — an automation that replies in Slack must not
 * wake itself up.
 */
export function isChannelMessage(
	event: MessageEvent,
	envelope: OwnBotEnvelope,
): event is ChannelMessageEvent {
	// The union's members disagree on which of these they carry; read them
	// loosely and let the subtype allow-list do the narrowing.
	const message = event as {
		subtype?: string;
		channel_type?: string;
		user?: string;
		bot_profile?: { app_id?: string };
	};
	if (message.channel_type !== "channel" && message.channel_type !== "group") {
		return false;
	}
	if (!MESSAGE_SUBTYPES.has(message.subtype)) return false;
	if (message.user && ownBotUserIds(envelope).includes(message.user)) {
		return false;
	}
	if (
		envelope.api_app_id !== undefined &&
		message.bot_profile?.app_id === envelope.api_app_id
	) {
		return false;
	}
	return true;
}

/**
 * Whether a reaction is one triggers should see: on a message (Slack also
 * delivers `item.type` of `file` and `file_comment`, which carry no channel
 * or ts) and not added by this app's own bot, whose completion reactions
 * would otherwise re-enter as events.
 */
export function isMessageReaction(
	event: ReactionAddedEvent,
	envelope: OwnBotEnvelope,
): boolean {
	const item = event.item as {
		type?: string;
		channel?: string;
		ts?: string;
	};
	if (item.type !== "message" || !item.channel || !item.ts) return false;
	return !ownBotUserIds(envelope).includes(event.user);
}

/** Slack's canonical permalink; slack.com redirects to the workspace domain. */
function permalink(channel: string, ts: string): string {
	return `https://slack.com/archives/${channel}/p${ts.replace(".", "")}`;
}

const MAX_TITLE = 120;

function titleFromText(text: string | undefined, fallback: string): string {
	const firstLine = (text ?? "").split("\n").find((line) => line.trim());
	if (!firstLine) return fallback;
	const trimmed = firstLine.trim();
	return trimmed.length > MAX_TITLE
		? `${trimmed.slice(0, MAX_TITLE - 1)}…`
		: trimmed;
}

function matchable(
	eventType: "message" | "reaction_added" | "channel_created",
	fields: Pick<
		SlackMatchableEvent,
		"channelId" | "actorId" | "body" | "reaction" | "isThreadReply"
	>,
): SlackMatchableEvent {
	return {
		provider: "slack",
		eventType,
		names: slackEventNames(eventType),
		// Slack events carry the user id and no handle; a lookup per message is
		// not worth a display column.
		actorLogin: fields.actorId,
		...fields,
	};
}

function normalizeSlackEvent(
	event: SlackAutomationEvent,
): NormalizedSlackEvent {
	switch (event.type) {
		case "message": {
			// A thread is one resource: replies key on the root, so a run in
			// flight on a thread debounces its own follow-ups.
			const root = event.thread_ts ?? event.ts;
			return {
				event: matchable("message", {
					channelId: event.channel,
					actorId: event.user ?? null,
					body: event.text ?? null,
					reaction: null,
					// A reply carries its root's ts; a root's thread_ts, when set,
					// is its own ts. A broadcast reply is also shown at the top
					// level, which is where a top-level-only trigger is looking.
					isThreadReply:
						event.subtype !== "thread_broadcast" &&
						event.thread_ts !== undefined &&
						event.thread_ts !== event.ts,
				}),
				resourceKey: `slack:${event.channel}:${root}`,
				title: titleFromText(event.text, `Message in ${event.channel}`),
				url: permalink(event.channel, event.ts),
			};
		}
		case "reaction_added":
			return {
				event: matchable("reaction_added", {
					channelId: event.item.channel,
					actorId: event.user ?? null,
					body: null,
					reaction: slackEmojiName(event.reaction),
					isThreadReply: false,
				}),
				resourceKey: `slack:${event.item.channel}:${event.item.ts}`,
				title: `:${slackEmojiName(event.reaction)}: reaction`,
				url: permalink(event.item.channel, event.item.ts),
			};
		case "channel_created":
			return {
				event: matchable("channel_created", {
					channelId: null,
					actorId: event.channel.creator ?? null,
					// The name is what a "matching" filter reads.
					body: event.channel.name ?? null,
					reaction: null,
					isThreadReply: false,
				}),
				resourceKey: `slack:${event.channel.id}`,
				title: `#${event.channel.name}`,
				url: `https://slack.com/archives/${event.channel.id}`,
			};
	}
}

export function normalizeSlackDelivery(params: {
	organizationId: string;
	connectionId: string;
	envelope: SlackAutomationEnvelope;
}): NormalizedDelivery {
	const { envelope } = params;
	const normalized = normalizeSlackEvent(envelope.event);
	return {
		event: {
			organizationId: params.organizationId,
			integrationConnectionId: params.connectionId,
			provider: "slack",
			eventType: normalized.event.eventType,
			// Idempotent on Slack's event_id: a retried delivery is the same event.
			externalEventId: envelope.event_id,
			resourceKey: normalized.resourceKey,
			title: normalized.title,
			url: normalized.url,
			actorLogin: normalized.event.actorLogin,
			payload: envelope,
		},
		dispatch: { event: normalized.event },
	};
}
