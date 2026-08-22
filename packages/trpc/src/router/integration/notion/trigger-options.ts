import {
	type Client,
	isFullDataSource,
	isFullUser,
	iteratePaginatedAPI,
} from "@notionhq/client";
import { activeConnection } from "../connections";
import type { TriggerOption, TriggerOptionSource } from "../trigger-options";
import { notionClient, plainText } from "./client";

/** Bounds a picker list; more is not pickable one by one anyway. */
const MAX_OPTIONS = 500;

/**
 * A client on the organization's connection, or null when there is none. A
 * token without the matching capability (or a personal token, which cannot
 * list users) throws to the shared procedure, which shows an empty list —
 * the chip keeps its "anyone / me" entries rather than the editor going red.
 */
async function connectedClient(organizationId: string): Promise<Client | null> {
	const connection = await activeConnection(organizationId, "notion", {
		accessToken: true,
	});
	return connection ? notionClient(connection.accessToken) : null;
}

/**
 * The data sources the workspace has shared with the integration. Ids, not
 * titles: a title can be renamed.
 */
const dataSources: TriggerOptionSource = async ({ organizationId }) => {
	const client = await connectedClient(organizationId);
	if (!client) return [];

	const options: TriggerOption[] = [];
	for await (const result of iteratePaginatedAPI(client.search, {
		filter: { property: "object", value: "data_source" },
		page_size: 100,
	})) {
		if (!isFullDataSource(result)) continue;
		options.push({
			id: result.id,
			label: plainText(result.title) || "Untitled",
		});
		if (options.length >= MAX_OPTIONS) break;
	}
	return options;
};

/**
 * The people in the workspace, by Notion user id — what a comment's author
 * and mentions carry. Bots are left out: nobody filters on them.
 */
const people: TriggerOptionSource = async ({ organizationId }) => {
	const client = await connectedClient(organizationId);
	if (!client) return [];

	const options: TriggerOption[] = [];
	for await (const user of iteratePaginatedAPI(client.users.list, {
		page_size: 100,
	})) {
		if (!isFullUser(user) || user.type !== "person") continue;
		options.push({
			id: user.id,
			label: user.name || user.person.email || user.id,
		});
		if (options.length >= MAX_OPTIONS) break;
	}
	return options.sort((a, b) => a.label.localeCompare(b.label));
};

export const notionTriggerOptions = { dataSources, people };
