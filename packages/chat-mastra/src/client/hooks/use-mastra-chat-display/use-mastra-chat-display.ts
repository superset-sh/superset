import { skipToken } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMastraServiceRouter } from "../../../server/trpc";
import { chatMastraServiceTrpc } from "../../provider";

type RouterInputs = inferRouterInputs<ChatMastraServiceRouter>;
type RouterOutputs = inferRouterOutputs<ChatMastraServiceRouter>;

type SessionInputs = RouterInputs["session"];
type SessionOutputs = RouterOutputs["session"];

type DisplayStateOutput = SessionOutputs["getDisplayState"];
type ListMessagesOutput = SessionOutputs["listMessages"];
type HistoryMessage = ListMessagesOutput[number];
type HistoryMessagePart = HistoryMessage["content"][number];

export type MastraChatDisplayState = DisplayStateOutput;
export type MastraChatHistoryMessages = ListMessagesOutput;

export interface UseMastraChatDisplayOptions {
	sessionId: string | null;
	cwd?: string;
	enabled?: boolean;
	fps?: number;
}

function toRefetchIntervalMs(fps: number): number {
	if (!Number.isFinite(fps) || fps <= 0) return Math.floor(1000 / 60);
	return Math.max(16, Math.floor(1000 / fps));
}

function findLastUserMessageIndex(messages: ListMessagesOutput): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === "user") return index;
	}
	return -1;
}

export function withoutActiveTurnAssistantHistory({
	messages,
	currentMessage,
	isRunning,
}: {
	messages: ListMessagesOutput;
	currentMessage: DisplayStateOutput["currentMessage"] | null;
	isRunning: boolean;
}): ListMessagesOutput {
	if (!isRunning || !currentMessage || currentMessage.role !== "assistant") {
		return messages;
	}

	const turnStartIndex = findLastUserMessageIndex(messages) + 1;
	const previousTurns = messages.slice(0, turnStartIndex);
	const activeTurnNonAssistant = messages
		.slice(turnStartIndex)
		.filter((message: HistoryMessage) => message.role !== "assistant");

	return [...previousTurns, ...activeTurnNonAssistant];
}

export function useMastraChatDisplay(options: UseMastraChatDisplayOptions) {
	const { sessionId, cwd, enabled = true, fps = 60 } = options;
	const utils = chatMastraServiceTrpc.useUtils();
	const [commandError, setCommandError] = useState<unknown>(null);

	const displayQuery = chatMastraServiceTrpc.session.getDisplayState.useQuery(
		sessionId ? { sessionId, ...(cwd ? { cwd } : {}) } : skipToken,
		{
			enabled: enabled && Boolean(sessionId),
			refetchInterval: toRefetchIntervalMs(fps),
			refetchIntervalInBackground: true,
			refetchOnWindowFocus: false,
			staleTime: 0,
			gcTime: 0,
		},
	);

	const messagesQuery = chatMastraServiceTrpc.session.listMessages.useQuery(
		sessionId ? { sessionId, ...(cwd ? { cwd } : {}) } : skipToken,
		{
			enabled: enabled && Boolean(sessionId),
			refetchInterval: toRefetchIntervalMs(fps),
			refetchIntervalInBackground: true,
			refetchOnWindowFocus: false,
			staleTime: 0,
			gcTime: 0,
		},
	);

	const displayState = displayQuery.data ?? null;
	const currentMessage = displayState?.currentMessage ?? null;
	const isRunning = displayState?.isRunning ?? false;
	const historicalMessages = messagesQuery.data ?? [];
	const [optimisticUserMessage, setOptimisticUserMessage] = useState<
		ListMessagesOutput[number] | null
	>(null);
	const optimisticTextRef = useRef<string | null>(null);

	useEffect(() => {
		const optimisticText = optimisticTextRef.current;
		if (!optimisticText) return;

		const found = historicalMessages.some(
			(message: HistoryMessage) =>
				message.role === "user" &&
				message.content.some(
					(part: HistoryMessagePart) =>
						part.type === "text" &&
						"text" in part &&
						part.text === optimisticText,
				),
		);
		if (!found) return;

		setOptimisticUserMessage(null);
		optimisticTextRef.current = null;
	}, [historicalMessages]);

	const messages = useMemo(() => {
		const withOptimistic = optimisticUserMessage
			? [...historicalMessages, optimisticUserMessage]
			: historicalMessages;
		return withoutActiveTurnAssistantHistory({
			messages: withOptimistic,
			currentMessage,
			isRunning,
		});
	}, [historicalMessages, optimisticUserMessage, currentMessage, isRunning]);

	const commands = useMemo(
		() => ({
			sendMessage: async (
				input: Omit<SessionInputs["sendMessage"], "sessionId">,
			) => {
				if (!sessionId) return;
				setCommandError(null);

				const text =
					typeof input.payload?.content === "string"
						? input.payload.content
						: "";
				if (text) {
					optimisticTextRef.current = text;
					setOptimisticUserMessage({
						id: `optimistic-${Date.now()}`,
						role: "user",
						content: [{ type: "text", text }],
						createdAt: new Date(),
					} as ListMessagesOutput[number]);
				}

				try {
					return await utils.client.session.sendMessage.mutate({
						sessionId,
						...(cwd ? { cwd } : {}),
						...input,
					});
				} catch (error) {
					setCommandError(error);
					setOptimisticUserMessage(null);
					optimisticTextRef.current = null;
					return;
				}
			},
			stop: async () => {
				if (!sessionId) return;
				setCommandError(null);
				try {
					return await utils.client.session.stop.mutate({ sessionId });
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			abort: async () => {
				if (!sessionId) return;
				setCommandError(null);
				try {
					return await utils.client.session.abort.mutate({ sessionId });
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			respondToApproval: async (
				input: Omit<SessionInputs["approval"]["respond"], "sessionId">,
			) => {
				if (!sessionId) return;
				setCommandError(null);
				try {
					return await utils.client.session.approval.respond.mutate({
						sessionId,
						...input,
					});
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			respondToQuestion: async (
				input: Omit<SessionInputs["question"]["respond"], "sessionId">,
			) => {
				if (!sessionId) return;
				setCommandError(null);
				try {
					return await utils.client.session.question.respond.mutate({
						sessionId,
						...input,
					});
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			respondToPlan: async (
				input: Omit<SessionInputs["plan"]["respond"], "sessionId">,
			) => {
				if (!sessionId) return;
				setCommandError(null);
				try {
					return await utils.client.session.plan.respond.mutate({
						sessionId,
						...input,
					});
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
		}),
		[cwd, sessionId, utils],
	);

	return {
		...displayState,
		messages,
		error: displayQuery.error ?? messagesQuery.error ?? commandError ?? null,
		commands,
	};
}

export type UseMastraChatDisplayReturn = ReturnType<
	typeof useMastraChatDisplay
>;
