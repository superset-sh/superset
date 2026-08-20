import {
	type Client,
	type PageCollection,
	PageIterator,
} from "@microsoft/microsoft-graph-client";
import type {
	Channel,
	ChatMessage,
	Team,
	User,
} from "@microsoft/microsoft-graph-types";

/**
 * The Graph resources the Teams provider reads. Graph returns far more fields
 * than the matcher uses; the rest is carried in the recorded payload as-is.
 */

/** Graph throttles per app per tenant; no picker needs an unbounded walk. */
const LIST_CAP = 1000;

async function listCollection<T>(client: Client, path: string): Promise<T[]> {
	const items: T[] = [];
	const firstPage: PageCollection = await client.api(path).get();
	const iterator = new PageIterator(client, firstPage, (item) => {
		items.push(item as T);
		return items.length < LIST_CAP;
	});
	await iterator.iterate();
	return items;
}

export function listTeams(client: Client): Promise<Team[]> {
	return listCollection<Team>(client, "/teams?$select=id,displayName");
}

/**
 * The tenant's people, as Entra object ids — what a channel message's
 * `from.user.id` carries. Needs the User.ReadBasic.All application permission.
 */
export function listUsers(client: Client): Promise<User[]> {
	return listCollection<User>(
		client,
		"/users?$select=id,displayName,mail,userPrincipalName&$top=999",
	);
}

export function listChannels(
	client: Client,
	teamId: string,
): Promise<Channel[]> {
	return listCollection<Channel>(
		client,
		`/teams/${encodeURIComponent(teamId)}/channels?$select=id,displayName,membershipType`,
	);
}

export function getChannel(
	client: Client,
	teamId: string,
	channelId: string,
): Promise<Channel> {
	return client
		.api(
			`/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}`,
		)
		.get();
}

/** A channel message, or a reply to one when `replyId` is set. */
export function getChannelMessage(
	client: Client,
	teamId: string,
	channelId: string,
	messageId: string,
	replyId?: string,
): Promise<ChatMessage> {
	const base = `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`;
	return client
		.api(replyId ? `${base}/replies/${encodeURIComponent(replyId)}` : base)
		.get();
}

/**
 * The text a filter is tested against. Teams bodies are usually HTML; the
 * tags are dropped and the handful of entities Teams emits are decoded so
 * "contains" means what the person typing the pattern sees.
 */
export function plainTextOf(body: ChatMessage["body"]): string | null {
	const content = body?.content;
	if (!content) return null;
	if (body?.contentType !== "html") return content;
	return content
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(p|div|li)>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.trim();
}
