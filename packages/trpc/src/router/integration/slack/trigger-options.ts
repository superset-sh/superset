import {
	type ConversationsListResponse,
	type UsersListResponse,
	WebClient,
} from "@slack/web-api";
import { activeConnection } from "../connections";
import type { TriggerOption, TriggerOptionSource } from "../trigger-options";

/** A hard stop, not a page size: enough for any workspace this is pointed at. */
const MAX_CHANNELS = 2000;
const MAX_PEOPLE = 1000;

/**
 * The bot's own client, or null when the workspace is not connected. No
 * retries and a short timeout: this answers a picker, and a `missing_scope`
 * (until the app is reinstalled with the scope) throws to the shared
 * procedure, which shows an empty list.
 */
async function slackClient(organizationId: string): Promise<WebClient | null> {
	const connection = await activeConnection(organizationId, "slack", {
		accessToken: true,
	});
	if (!connection) return null;
	return new WebClient(connection.accessToken, {
		timeout: 5_000,
		retryConfig: { retries: 0 },
	});
}

function byLabel(options: TriggerOption[]): TriggerOption[] {
	return options.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Public and private channels both — a private channel the bot has been
 * invited to is where "a message in #incidents" most often means something.
 */
const channels: TriggerOptionSource = async ({ organizationId }) => {
	const client = await slackClient(organizationId);
	if (!client) return [];

	const options: TriggerOption[] = [];
	const pages = client.paginate("conversations.list", {
		types: "public_channel,private_channel",
		exclude_archived: true,
		limit: 200,
	}) as AsyncIterable<ConversationsListResponse>;
	for await (const page of pages) {
		for (const channel of page.channels ?? []) {
			if (channel.id && channel.name) {
				options.push({
					id: channel.id,
					label: `#${channel.name}`,
					// A private channel only appears in this list because the bot is in
					// it; for public ones Slack says outright. Events never arrive from
					// a channel where this is false.
					botMember: channel.is_private ? true : channel.is_member === true,
				});
			}
		}
		if (options.length >= MAX_CHANNELS) break;
	}
	return byLabel(options);
};

/**
 * The workspace's human members, keyed by Slack user id — what an event's
 * `user` carries and the matcher compares against.
 */
const people: TriggerOptionSource = async ({ organizationId }) => {
	const client = await slackClient(organizationId);
	if (!client) return [];

	const options: TriggerOption[] = [];
	const pages = client.paginate("users.list", {
		limit: 200,
	}) as AsyncIterable<UsersListResponse>;
	for await (const page of pages) {
		for (const member of page.members ?? []) {
			if (!member.id || member.deleted || member.is_bot) continue;
			if (member.id === "USLACKBOT") continue;
			const label = member.real_name || member.name;
			if (label) options.push({ id: member.id, label });
		}
		if (options.length >= MAX_PEOPLE) break;
	}
	return byLabel(options);
};

export const slackTriggerOptions = { channels, people };
