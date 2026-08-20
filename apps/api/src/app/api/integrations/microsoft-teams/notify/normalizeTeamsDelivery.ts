import type { Channel, ChatMessage } from "@microsoft/microsoft-graph-types";
import type { MicrosoftTeamsMatchableEvent } from "@superset/shared/automation-matching";
import { plainTextOf } from "@superset/trpc/integrations/microsoft-teams";

import type { NormalizedDelivery } from "@/lib/automations/ingestAutomationEvent";
import type { AuthenticatedConnection } from "./notifications";

const TITLE_LENGTH = 120;

/** A fetched channel message as the row to record and the event to match. */
export function normalizeChannelMessage(
	connection: AuthenticatedConnection,
	resource: {
		teamId: string;
		channelId: string;
		messageId: string;
		replyId?: string;
	},
	message: ChatMessage,
): NormalizedDelivery {
	// Membership changes and the like arrive as messages too; nobody means
	// those when they say "a message in the channel".
	if (message.messageType && message.messageType !== "message") {
		return { skip: `messageType ${message.messageType}` };
	}
	const messageId = resource.replyId ?? resource.messageId;
	const text = plainTextOf(message.body);
	const actorLogin =
		message.from?.user?.displayName ??
		message.from?.application?.displayName ??
		null;
	const event: MicrosoftTeamsMatchableEvent = {
		provider: "microsoft_teams",
		eventType: "message_in_channel",
		teamId: resource.teamId,
		channelId: resource.channelId,
		actorId: message.from?.user?.id ?? null,
		actorLogin,
		body: text,
	};
	return {
		event: {
			organizationId: connection.organizationId,
			integrationConnectionId: connection.id,
			provider: "microsoft_teams",
			eventType: "message_in_channel",
			externalEventId: `${resource.channelId}:${messageId}`,
			// The thread, so replies debounce with the message they answer.
			resourceKey: `microsoft_teams:${resource.teamId}:${resource.channelId}:${message.replyToId ?? resource.messageId}`,
			title: titleFor(message.subject, text),
			url: message.webUrl ?? null,
			actorLogin,
			payload: {
				teamId: resource.teamId,
				channelId: resource.channelId,
				message,
			},
		},
		dispatch: { event },
	};
}

/** A fetched channel as the row to record and the event to match. */
export function normalizeChannelCreated(
	connection: AuthenticatedConnection,
	resource: { teamId: string; channelId: string },
	channel: Channel,
): NormalizedDelivery {
	const name = channel.displayName ?? resource.channelId;
	const event: MicrosoftTeamsMatchableEvent = {
		provider: "microsoft_teams",
		eventType: "channel_created",
		teamId: resource.teamId,
		channelId: resource.channelId,
		actorId: null,
		actorLogin: null,
		body: name,
	};
	return {
		event: {
			organizationId: connection.organizationId,
			integrationConnectionId: connection.id,
			provider: "microsoft_teams",
			eventType: "channel_created",
			externalEventId: resource.channelId,
			resourceKey: `microsoft_teams:${resource.teamId}:${resource.channelId}`,
			title: name,
			url: channel.webUrl ?? null,
			actorLogin: null,
			payload: { teamId: resource.teamId, channel },
		},
		dispatch: { event },
	};
}

function titleFor(subject: string | null | undefined, text: string | null) {
	if (subject) return subject;
	const line = text
		?.split("\n")
		.find((l) => l.trim())
		?.trim();
	if (!line) return "Teams message";
	return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH)}…` : line;
}
