import { useEffect, useMemo, useRef, useState } from "react";
import { dedupeMessages, type MastraMessage } from "./message-dedupe";

export interface UseMessagesOptions {
	historicalMessages: MastraMessage[];
	currentMessage: MastraMessage | null;
	isRunning: boolean;
}

function findLastUserIndex(messages: MastraMessage[]): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === "user") return index;
	}
	return -1;
}

function mergeActiveTurnAssistantForStreaming({
	activeTurnMessages,
	currentMessage,
}: {
	activeTurnMessages: MastraMessage[];
	currentMessage: MastraMessage;
}): MastraMessage {
	const historicalToolParts = activeTurnMessages
		.filter((message) => message.role === "assistant")
		.flatMap((message) =>
			message.content.filter(
				(part) => part.type === "tool_call" || part.type === "tool_result",
			),
		);

	return {
		...currentMessage,
		content: [...historicalToolParts, ...currentMessage.content],
	};
}

export function reconcileStreamingCandidates({
	historicalMessages,
	optimisticMessage,
	currentMessage,
	isRunning,
}: {
	historicalMessages: MastraMessage[];
	optimisticMessage: MastraMessage | null;
	currentMessage: MastraMessage | null;
	isRunning: boolean;
}): MastraMessage[] {
	const candidates: MastraMessage[] = [...historicalMessages];
	if (optimisticMessage) candidates.push(optimisticMessage);

	if (!currentMessage || !isRunning) {
		return candidates;
	}

	if (currentMessage.role !== "assistant") {
		const index = candidates.findIndex(
			(message) => message.id === currentMessage.id,
		);
		if (index >= 0) {
			candidates[index] = currentMessage;
			return candidates;
		}
		candidates.push(currentMessage);
		return candidates;
	}

	const existingIndex = candidates.findIndex(
		(message) => message.id === currentMessage.id,
	);
	if (existingIndex >= 0) {
		candidates[existingIndex] = currentMessage;
		return candidates;
	}

	const lastUserIndex = findLastUserIndex(candidates);
	const turnStartIndex = lastUserIndex + 1;
	const activeTurnMessages = candidates.slice(turnStartIndex);
	const mergedCurrentAssistant = mergeActiveTurnAssistantForStreaming({
		activeTurnMessages,
		currentMessage,
	});
	const next: MastraMessage[] = candidates.slice(0, turnStartIndex);
	let insertedCurrentMessage = false;

	for (const message of activeTurnMessages) {
		if (message.role !== "assistant") {
			next.push(message);
			continue;
		}
		if (!insertedCurrentMessage) {
			next.push(mergedCurrentAssistant);
			insertedCurrentMessage = true;
		}
	}

	if (!insertedCurrentMessage) {
		next.push(mergedCurrentAssistant);
	}

	return next;
}

export function useMessages({
	historicalMessages,
	currentMessage,
	isRunning,
}: UseMessagesOptions) {
	const [optimistic, setOptimistic] = useState<MastraMessage | null>(null);
	const optimisticTextRef = useRef<string | null>(null);

	// Clear optimistic once the real user message appears in history
	useEffect(() => {
		const optimisticText = optimisticTextRef.current;
		if (!optimisticText) return;

		const found = historicalMessages.some(
			(m) =>
				m.role === "user" &&
				m.content.some(
					(c) => c.type === "text" && "text" in c && c.text === optimisticText,
				),
		);
		if (!found) return;

		setOptimistic(null);
		optimisticTextRef.current = null;
	}, [historicalMessages]);

	const messages = useMemo(() => {
		const candidates = reconcileStreamingCandidates({
			historicalMessages,
			optimisticMessage: optimistic,
			currentMessage,
			isRunning,
		});
		return dedupeMessages(candidates);
	}, [historicalMessages, optimistic, currentMessage, isRunning]);

	const addOptimisticUserMessage = (text: string) => {
		optimisticTextRef.current = text;
		setOptimistic({
			id: `optimistic-${Date.now()}`,
			role: "user",
			content: [{ type: "text", text }],
			createdAt: new Date(),
		} as MastraMessage);
	};

	const clearOptimistic = () => {
		setOptimistic(null);
		optimisticTextRef.current = null;
	};

	return { messages, addOptimisticUserMessage, clearOptimistic };
}
