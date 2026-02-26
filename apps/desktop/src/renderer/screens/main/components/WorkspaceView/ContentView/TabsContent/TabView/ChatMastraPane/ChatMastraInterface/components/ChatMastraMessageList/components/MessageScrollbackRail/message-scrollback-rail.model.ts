import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";

export const PREVIEW_CHARACTER_LIMIT = 80;

export type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];

export interface UserMessageEntry {
	id: string;
	preview: string;
	top: number;
	isLatest: boolean;
}

export interface BaseUserMessageEntry {
	id: string;
	preview: string;
	isLatest: boolean;
}

export function truncatePreview(text: string): string {
	if (text.length <= PREVIEW_CHARACTER_LIMIT) {
		return text;
	}

	return `${text.slice(0, PREVIEW_CHARACTER_LIMIT - 3)}...`;
}

export function buildPreview(message: MastraMessage): string {
	const textContent = message.content
		.filter(
			(
				part,
			): part is Extract<MastraMessage["content"][number], { type: "text" }> =>
				part.type === "text",
		)
		.map((part) => part.text.trim())
		.filter(Boolean)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();

	if (textContent) {
		return truncatePreview(textContent);
	}

	const attachmentCount = message.content.filter(
		(part) => part.type === "image",
	).length;
	if (attachmentCount > 0) {
		return attachmentCount === 1
			? "Sent 1 attachment"
			: `Sent ${attachmentCount} attachments`;
	}

	return "(empty message)";
}

export function buildUserMessageEntries(
	messages: MastraMessage[],
): BaseUserMessageEntry[] {
	return messages
		.filter((message) => message.role === "user")
		.map((message, index, allMessages) => ({
			id: message.id,
			preview: buildPreview(message),
			isLatest: index === allMessages.length - 1,
		}));
}

export function findActiveMessageId(
	entries: UserMessageEntry[],
	scrollTop: number,
): string | null {
	if (entries.length === 0) {
		return null;
	}

	let activeId = entries[0]?.id ?? null;
	const adjustedTop = scrollTop + 4;

	for (const entry of entries) {
		if (entry.top <= adjustedTop) {
			activeId = entry.id;
			continue;
		}
		break;
	}

	return activeId;
}
