import type { TimelineEntry } from "@superset/chat/core";
import {
	type AgentMessage,
	type Item,
	isKnownItem,
	type ToolCall,
} from "@superset/chat/protocol";
import type { PageLink, PageLinkFinder } from "../../../../utils/pageLinks";

// Output that links more pages than this is a listing, not something the agent made.
const MAX_PAGES_PER_TOOL_CALL = 3;

export type TurnPageLinks = {
	/**
	 * By agent message id: the slugs earlier messages of the turn already link,
	 * space-separated so a memoized row sees an equal value on every rebuild.
	 */
	shownEarlier: ReadonlyMap<string, string>;
	/** By tool call id: the pages its output links and no message of the turn does. */
	fromTools: ReadonlyMap<string, readonly PageLink[]>;
};

function isAgentMessage(item: Item): item is AgentMessage {
	return isKnownItem(item) && item.kind === "agent_message";
}

function toolCalls(entry: TimelineEntry): readonly ToolCall[] {
	if (entry.kind === "tool_run") return entry.items;
	return isKnownItem(entry.item) && entry.item.kind === "tool_call"
		? [entry.item]
		: [];
}

function toolOutputLinks(
	tool: ToolCall,
	findPageLinks: PageLinkFinder,
): PageLink[] {
	const links = new Map<string, PageLink>();
	for (const content of tool.content) {
		const output =
			content.type === "text"
				? content.text
				: content.type === "terminal"
					? content.output
					: "";
		for (const link of findPageLinks(output)) {
			if (!links.has(link.slug)) links.set(link.slug, link);
		}
	}
	return [...links.values()];
}

/**
 * Where a turn shows each page it links, once. A message that links a page
 * shows it. A page only a tool call printed waits for the turn to settle,
 * because the reply usually repeats the link and the card would have to move.
 */
export function turnPageLinks(
	entries: readonly TimelineEntry[],
	settled: boolean,
	findPageLinks: PageLinkFinder,
): TurnPageLinks {
	const shownEarlier = new Map<string, string>();
	const shown = new Set<string>();
	for (const entry of entries) {
		if (entry.kind !== "item" || !isAgentMessage(entry.item)) continue;
		if (shown.size > 0) shownEarlier.set(entry.item.id, [...shown].join(" "));
		for (const link of findPageLinks(entry.item.text)) shown.add(link.slug);
	}

	const fromTools = new Map<string, readonly PageLink[]>();
	if (!settled) return { shownEarlier, fromTools };
	for (const entry of entries) {
		for (const tool of toolCalls(entry)) {
			if (tool.status === "running") continue;
			const linked = toolOutputLinks(tool, findPageLinks);
			if (linked.length > MAX_PAGES_PER_TOOL_CALL) continue;
			const fresh = linked.filter((link) => !shown.has(link.slug));
			if (fresh.length === 0) continue;
			for (const link of fresh) shown.add(link.slug);
			fromTools.set(tool.id, fresh);
		}
	}
	return { shownEarlier, fromTools };
}
