import type {
	NotionTriggerEvent,
	TriggerConfigInput,
	TriggerScope,
} from "../automation-triggers";
import {
	type BaseMatchableEvent,
	type MatchResult,
	no,
	scopeAllows,
	scopeAllowsAny,
} from "./core";

/**
 * A Notion delivery, normalized to what Notion triggers filter on. The
 * delivery itself carries only ids; everything here comes from the webhook
 * route fetching the entity it names.
 */
export type NotionMatchableEvent = BaseMatchableEvent & {
	provider: "notion";
	/** The data source the page belongs to, or the data source itself. */
	dataSourceId: string | null;
	/** The page a comment sits on. Null for data source events. */
	pageId: string | null;
	/** Users @-mentioned in a comment's rich text. Empty for other events. */
	mentionedUserIds: string[];
};

/**
 * Maps a Notion delivery to the events a trigger names. A comment that
 * mentions someone is both a comment and a mention.
 */
export function notionEventNames(eventType: string): NotionTriggerEvent[] {
	switch (eventType) {
		case "data_source.content_updated":
			return ["data_source.content_updated"];
		case "comment.created":
			return ["comment.created", "comment.mentioned"];
		default:
			return [];
	}
}

/** Whether a Notion trigger config accepts this event. */
export function notionTriggerMatches(
	config: Extract<TriggerConfigInput, { kind: "notion" }>,
	event: NotionMatchableEvent,
): MatchResult {
	if (!notionEventNames(event.eventType).includes(config.event)) {
		return no("event");
	}
	if (!scopeAllows(config.dataSources, event.dataSourceId)) {
		return no("dataSource");
	}
	const pages: TriggerScope | undefined =
		"pages" in config ? config.pages : undefined;
	if (pages !== undefined && !scopeAllows(pages, event.pageId)) {
		return no("page");
	}
	if ("actor" in config && !scopeAllows(config.actor, event.actorId)) {
		return no("actor");
	}
	if ("mentionedUser" in config) {
		// A comment that mentions nobody is not a mention, whoever the trigger
		// is watching for.
		if (event.mentionedUserIds.length === 0) return no("mention");
		if (!scopeAllowsAny(config.mentionedUser, event.mentionedUserIds)) {
			return no("mentionedUser");
		}
	}
	return { matches: true };
}
