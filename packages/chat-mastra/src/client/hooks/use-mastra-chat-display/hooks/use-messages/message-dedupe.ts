import type { inferRouterOutputs } from "@trpc/server";
import type { ChatMastraServiceRouter } from "../../../../../server/trpc";

export type MastraMessage = NonNullable<
	inferRouterOutputs<ChatMastraServiceRouter>["session"]["listMessages"]
>[number];

export interface DedupeSummary {
	initialMessageCount: number;
	finalMessageCount: number;
	droppedMessageIds: string[];
	droppedToolPartCount: number;
	droppedToolPartsByMessage: Record<string, number>;
}

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

function countPartKeys(parts: MastraMessage["content"]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const part of parts) {
		const key = toStableJson(part);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

function isContentSubset(
	subset: MastraMessage["content"],
	superset: MastraMessage["content"],
): boolean {
	if (subset.length > superset.length) return false;
	const remaining = countPartKeys(superset);

	for (const part of subset) {
		const key = toStableJson(part);
		const count = remaining.get(key) ?? 0;
		if (count <= 0) return false;
		if (count === 1) {
			remaining.delete(key);
		} else {
			remaining.set(key, count - 1);
		}
	}

	return true;
}

function pruneSubsumedAssistantMessages(messages: MastraMessage[]): {
	messages: MastraMessage[];
	droppedMessageIds: string[];
} {
	const droppedIndexes = new Set<number>();
	const droppedMessageIds: string[] = [];

	for (let index = 0; index < messages.length; index++) {
		const current = messages[index];
		if (!current || current.role !== "assistant") continue;

		for (
			let nextIndex = index + 1;
			nextIndex < messages.length;
			nextIndex += 1
		) {
			const next = messages[nextIndex];
			if (!next) continue;

			// Only compare assistant messages within the same turn.
			if (next.role === "user") break;
			if (next.role !== "assistant") continue;

			if (!isContentSubset(current.content, next.content)) {
				continue;
			}

			droppedIndexes.add(index);
			droppedMessageIds.push(current.id);
			break;
		}
	}

	if (droppedIndexes.size === 0) {
		return { messages, droppedMessageIds };
	}

	return {
		messages: messages.filter((_, index) => !droppedIndexes.has(index)),
		droppedMessageIds,
	};
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

export function dedupeMessages(candidates: MastraMessage[]): {
	messages: MastraMessage[];
	summary: DedupeSummary;
} {
	const messagesById = new Map<string, MastraMessage>();
	const droppedMessageIds: string[] = [];
	const droppedToolPartsByMessage: Record<string, number> = {};
	let droppedToolPartCount = 0;

	for (const candidate of candidates) {
		const { message: dedupedToolMessage, droppedCount } =
			dedupeMessageToolParts(candidate);
		const messageId = dedupedToolMessage.id;

		if (messagesById.has(messageId)) {
			droppedMessageIds.push(messageId);
		}
		messagesById.set(messageId, dedupedToolMessage);

		if (droppedCount > 0) {
			droppedToolPartCount += droppedCount;
			droppedToolPartsByMessage[messageId] =
				(droppedToolPartsByMessage[messageId] ?? 0) + droppedCount;
		}
	}

	const orderedByIdDedupedMessages = [...messagesById.values()];
	const {
		messages: prunedMessages,
		droppedMessageIds: droppedSubsumedMessageIds,
	} = pruneSubsumedAssistantMessages(orderedByIdDedupedMessages);
	const allDroppedMessageIds = [
		...new Set([...droppedMessageIds, ...droppedSubsumedMessageIds]),
	];

	return {
		messages: prunedMessages,
		summary: {
			initialMessageCount: candidates.length,
			finalMessageCount: prunedMessages.length,
			droppedMessageIds: allDroppedMessageIds,
			droppedToolPartCount,
			droppedToolPartsByMessage,
		},
	};
}
