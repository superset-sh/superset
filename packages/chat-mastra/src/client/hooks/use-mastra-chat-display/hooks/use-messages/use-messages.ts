import type { inferRouterOutputs } from "@trpc/server";
import { useMemo, useRef, useState } from "react";
import type { ChatMastraServiceRouter } from "../../../../../server/trpc";

type MastraMessage = NonNullable<
	inferRouterOutputs<ChatMastraServiceRouter>["session"]["listMessages"]
>[number];

export interface UseMessagesOptions {
	historicalMessages: MastraMessage[];
	currentMessage: MastraMessage | null;
	isRunning: boolean;
}

export function useMessages({
	historicalMessages,
	currentMessage,
	isRunning,
}: UseMessagesOptions) {
	const [optimistic, setOptimistic] = useState<MastraMessage | null>(null);
	const optimisticTextRef = useRef<string | null>(null);

	// Clear optimistic once the real user message appears in history
	if (optimisticTextRef.current) {
		const found = historicalMessages.some(
			(m) =>
				m.role === "user" &&
				m.content.some(
					(c) =>
						c.type === "text" &&
						"text" in c &&
						c.text === optimisticTextRef.current,
				),
		);
		if (found) {
			setOptimistic(null);
			optimisticTextRef.current = null;
		}
	}

	const messages = useMemo(() => {
		const result = [...historicalMessages];

		if (optimistic) {
			result.push(optimistic);
		}

		if (currentMessage && isRunning) {
			result.push(currentMessage);
		}

		return result;
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
