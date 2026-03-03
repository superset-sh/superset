import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import type { ChatSendMessageInput } from "../sendMessage";

export type MastraHistoryMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];

export function toOptimisticUserMessage(
	input: ChatSendMessageInput,
): MastraHistoryMessage | null {
	const text = input.payload.content.trim();
	const images = input.payload.images ?? [];
	if (!text && images.length === 0) return null;

	return {
		id: `optimistic-${crypto.randomUUID()}`,
		role: "user",
		content: [
			...(text ? [{ type: "text", text }] : []),
			...images.map((image) => ({
				type: "image",
				data: image.data,
				mimeType: image.mimeType,
			})),
		],
		createdAt: new Date(),
	} as MastraHistoryMessage;
}

function toUserMessageSignature(message: MastraHistoryMessage): string | null {
	if (message.role !== "user") return null;
	return message.content
		.map((part) => {
			if (part.type === "text") return `text:${part.text}`;
			if (part.type === "image") return `image:${part.mimeType}:${part.data}`;
			return `${part.type}:${JSON.stringify(part)}`;
		})
		.join("||");
}

export function hasMatchingUserMessage({
	messages,
	candidate,
}: {
	messages: MastraHistoryMessage[];
	candidate: MastraHistoryMessage;
}): boolean {
	const signature = toUserMessageSignature(candidate);
	if (!signature) return false;
	return messages.some(
		(message) => toUserMessageSignature(message) === signature,
	);
}
