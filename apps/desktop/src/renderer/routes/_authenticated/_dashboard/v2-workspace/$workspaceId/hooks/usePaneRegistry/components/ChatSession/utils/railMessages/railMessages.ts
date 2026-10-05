import type { TurnGroup } from "@superset/chat/core";
import type { AgentMessage, UserMessage } from "@superset/chat/protocol";
import type { ChatHistorySidebarMessage } from "@superset/ui/chat-history-sidebar";
import { userMessageText } from "../userMessageText";

const PREVIEW_CHARS = 120;

function preview(text: string): string {
	const line = text.trim().split("\n", 1)[0] ?? "";
	return line.length > PREVIEW_CHARS
		? `${line.slice(0, PREVIEW_CHARS).trimEnd()}…`
		: line;
}

/**
 * The conversation as the rail reads it: the messages, in order, each one a
 * line. The rail pairs a user message with the assistant message that follows
 * it, so both roles go in and the pairing is its own.
 */
export function railMessages(groups: TurnGroup[]): ChatHistorySidebarMessage[] {
	const messages: ChatHistorySidebarMessage[] = [];
	for (const group of groups) {
		for (const entry of group.entries) {
			if (entry.kind !== "item") continue;
			const { item } = entry;
			if (item.kind === "user_message") {
				const line = preview(userMessageText(item as UserMessage));
				if (line) messages.push({ id: item.id, role: "user", preview: line });
				continue;
			}
			if (item.kind === "agent_message") {
				const line = preview((item as AgentMessage).text);
				if (line) {
					messages.push({ id: item.id, role: "assistant", preview: line });
				}
			}
		}
	}
	return messages;
}
