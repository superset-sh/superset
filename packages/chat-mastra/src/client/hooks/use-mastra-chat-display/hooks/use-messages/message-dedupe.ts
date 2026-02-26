import type { inferRouterOutputs } from "@trpc/server";
import type { ChatMastraServiceRouter } from "../../../../../server/trpc";

export type MastraMessage = NonNullable<
	inferRouterOutputs<ChatMastraServiceRouter>["session"]["listMessages"]
>[number];

function toStableJson(value: unknown): string {
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (Array.isArray(value)) {
		return `[${value.map((item) => toStableJson(item)).join(",")}]`;
	}
	if (typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>).sort(
			([left], [right]) => left.localeCompare(right),
		);
		return `{${entries
			.map(
				([key, entryValue]) =>
					`${JSON.stringify(key)}:${toStableJson(entryValue)}`,
			)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function getToolCallSignature(part: { name: string; args: unknown }): string {
	return `${part.name}:${toStableJson(part.args)}`;
}

export function dedupeMessageToolParts(message: MastraMessage): {
	message: MastraMessage;
	droppedCount: number;
} {
	const toolCallIndexes = new Map<string, number>();
	const toolResultIndexes = new Map<string, number>();
	let dedupedContent: MastraMessage["content"] = [];
	let droppedCount = 0;

	for (const part of message.content) {
		if (part.type === "tool_call") {
			const existingIndex = toolCallIndexes.get(part.id);
			if (existingIndex === undefined) {
				toolCallIndexes.set(part.id, dedupedContent.length);
				dedupedContent.push(part);
			} else {
				// Keep latest payload for repeated tool call IDs.
				dedupedContent[existingIndex] = part;
				droppedCount += 1;
			}
			continue;
		}

		if (part.type === "tool_result") {
			const existingIndex = toolResultIndexes.get(part.id);
			if (existingIndex === undefined) {
				toolResultIndexes.set(part.id, dedupedContent.length);
				dedupedContent.push(part);
			} else {
				// Keep latest tool result for repeated tool call IDs.
				dedupedContent[existingIndex] = part;
				droppedCount += 1;
			}
			continue;
		}

		dedupedContent.push(part);
	}

	const resolvedToolCallIds = new Set(
		dedupedContent
			.filter(
				(
					part,
				): part is Extract<
					MastraMessage["content"][number],
					{ type: "tool_result" }
				> => part.type === "tool_result",
			)
			.map((part) => part.id),
	);

	if (resolvedToolCallIds.size > 0) {
		const resolvedToolSignatures = new Set(
			dedupedContent
				.filter(
					(
						part,
					): part is Extract<
						MastraMessage["content"][number],
						{ type: "tool_call" }
					> => part.type === "tool_call" && resolvedToolCallIds.has(part.id),
				)
				.map((part) => getToolCallSignature(part)),
		);

		if (resolvedToolSignatures.size > 0) {
			const nextContent: MastraMessage["content"] = [];
			for (const part of dedupedContent) {
				if (part.type !== "tool_call") {
					nextContent.push(part);
					continue;
				}

				const hasMatchingResult = resolvedToolCallIds.has(part.id);
				if (hasMatchingResult) {
					nextContent.push(part);
					continue;
				}

				const signature = getToolCallSignature(part);
				if (resolvedToolSignatures.has(signature)) {
					droppedCount += 1;
					continue;
				}

				nextContent.push(part);
			}
			dedupedContent = nextContent;
		}
	}

	if (droppedCount === 0) {
		return { message, droppedCount: 0 };
	}

	return {
		message: {
			...message,
			content: dedupedContent,
		},
		droppedCount,
	};
}

export function dedupeMessages(candidates: MastraMessage[]): MastraMessage[] {
	const messagesById = new Map<string, MastraMessage>();

	for (const candidate of candidates) {
		const { message: dedupedToolMessage } = dedupeMessageToolParts(candidate);
		const messageId = dedupedToolMessage.id;
		messagesById.set(messageId, dedupedToolMessage);
	}

	return [...messagesById.values()];
}
