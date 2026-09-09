import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type {
	NotionTriggerEvent,
	TriggerConfigInput,
} from "@superset/shared/automation-triggers";
import type { TriggerMenuEntry } from "../types";

export type NotionConfig = Extract<TriggerConfigInput, { kind: "notion" }>;

/**
 * The sentence a Notion trigger reads as. Same shape as GitHub's grammar: each
 * event names its own words and slots, and the row renders them in order.
 */

export type Slot = "dataSources" | "pages" | "actor" | "mentionedUser";

export type SentencePart = { text: string } | { slot: Slot };

export const NOTION_SENTENCES: Record<NotionTriggerEvent, SentencePart[]> = {
	"data_source.content_updated": [
		{ text: "Rows changed in" },
		{ slot: "dataSources" },
	],
	"comment.created": [
		{ text: "Comment added in" },
		{ slot: "dataSources" },
		{ text: "on" },
		{ slot: "pages" },
		{ text: "by" },
		{ slot: "actor" },
	],
	"comment.mentioned": [
		{ text: "Comment mentions" },
		{ slot: "mentionedUser" },
		{ text: "in" },
		{ slot: "dataSources" },
		{ text: "on" },
		{ slot: "pages" },
	],
};

export const NOTION_MENU: TriggerMenuEntry<NotionConfig>[] = [
	leaf(
		msg({
			message: "Rows changed",
		}),
		"data_source.content_updated",
	),
	leaf(
		msg({
			message: "Comment added",
		}),
		"comment.created",
	),
	leaf(
		msg({
			message: "Comment mentions user",
		}),
		"comment.mentioned",
	),
];

function leaf(label: MessageDescriptor, event: NotionTriggerEvent) {
	return { label, create: () => createNotionConfig(event) };
}

/**
 * A new trigger of this event: the data source still to be chosen, every
 * optional filter wide open.
 */
export function createNotionConfig(event: NotionTriggerEvent): NotionConfig {
	// An empty list matches nothing, so an unfinished trigger cannot fire on
	// every data source; the form refuses to save until one is chosen.
	const base = {
		kind: "notion" as const,
		dataSources: { mode: "list" as const, ids: [] as string[] },
	};
	switch (event) {
		case "data_source.content_updated":
			return { ...base, event };
		case "comment.created":
			// Pages are an optional narrowing, so they start at "any" — an empty
			// list here would read as "Any page" while matching nothing.
			return {
				...base,
				event,
				pages: { mode: "any" as const },
				actor: { mode: "any" as const },
			};
		case "comment.mentioned":
			return {
				...base,
				event,
				pages: { mode: "any" as const },
				mentionedUser: { mode: "any" as const },
			};
	}
}
