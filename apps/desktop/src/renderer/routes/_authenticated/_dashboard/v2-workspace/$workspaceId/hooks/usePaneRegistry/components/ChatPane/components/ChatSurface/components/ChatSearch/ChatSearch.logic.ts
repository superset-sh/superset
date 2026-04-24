/**
 * Pure search logic for the Phase 7 chat search. Iterates the current
 * session's messages + parts and returns flat match records the UI can
 * scroll to / highlight.
 *
 * Matches live in text parts only (not tool input/output, not reasoning)
 * — the goal is "find something I said or the assistant said to me",
 * not a full session grep.
 */

import type { Message, Part } from "@superset/chat/shared";

export interface ChatSearchMatch {
	messageID: string;
	partID: string;
	/** Index in the part's text where the match begins. */
	offset: number;
	length: number;
}

export interface ChatSearchSource {
	messages: Message[];
	parts: Record<string, Part[]>;
}

export function findChatMatches(
	source: ChatSearchSource,
	query: string,
	opts: { caseSensitive?: boolean } = {},
): ChatSearchMatch[] {
	const q = query;
	if (!q) return [];
	const compare = opts.caseSensitive ?? false;

	const results: ChatSearchMatch[] = [];
	const needle = compare ? q : q.toLowerCase();
	for (const message of source.messages) {
		const parts = source.parts[message.id];
		if (!parts) continue;
		for (const part of parts) {
			if (part.type !== "text") continue;
			if (part.synthetic) continue;
			const haystack = compare ? part.text : part.text.toLowerCase();
			let searchFrom = 0;
			// biome-ignore lint/suspicious/noConstantBinaryExpression: loop guard below
			while (true) {
				const idx = haystack.indexOf(needle, searchFrom);
				if (idx < 0) break;
				results.push({
					messageID: message.id,
					partID: part.id,
					offset: idx,
					length: needle.length,
				});
				searchFrom = idx + Math.max(1, needle.length);
			}
		}
	}
	return results;
}
