import {
	readBookkeeping,
	type TurnGroup,
	userMessageText,
} from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import { parseAttachmentTags } from "../attachmentTags";

export function promptHistory(
	groups: TurnGroup[],
	harness: string | undefined,
): string[] {
	const history: string[] = [];
	for (const group of groups) {
		for (const entry of group.entries) {
			if (entry.kind !== "item" || entry.item.kind !== "user_message") continue;
			const raw = userMessageText(entry.item as UserMessage);
			if (readBookkeeping(harness, raw)) continue;
			const { text } = parseAttachmentTags(raw);
			if (!text) continue;
			if (text !== history.at(-1)) history.push(text);
		}
	}
	return history;
}
