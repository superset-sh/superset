import { skipToken } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatRuntimeServiceRouter } from "../../../server/trpc";
import { chatRuntimeServiceTrpc } from "../../provider";

type RouterInputs = inferRouterInputs<ChatRuntimeServiceRouter>;
type RouterOutputs = inferRouterOutputs<ChatRuntimeServiceRouter>;

type SessionInputs = RouterInputs["session"];
type SessionOutputs = RouterOutputs["session"];

type DisplayStateOutput = SessionOutputs["getDisplayState"];
type ListMessagesOutput = SessionOutputs["listMessages"];
type HistoryMessage = ListMessagesOutput[number];
type HistoryMessagePart = HistoryMessage["content"][number];

export type ChatDisplayState = DisplayStateOutput;
export type ChatHistoryMessages = ListMessagesOutput;

export interface UseChatDisplayOptions {
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

export function findLatestAssistantErrorMessage(
	messages: ListMessagesOutput,
): string | null {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index] as {
			role?: string;
			stopReason?: string;
			errorMessage?: string;
		};
		if (message.role !== "assistant") continue;
		if (message.stopReason !== undefined && message.stopReason !== "error") {
			return null;
		}
		if (
			typeof message.errorMessage === "string" &&
			message.errorMessage.trim().length > 0
		) {
			return message.errorMessage.trim();
		}
		return null;
	}
	return null;
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
	const activeTurnMessages = messages.slice(turnStartIndex);

	// Keep a historical assistant message only when it is both:
	//   1. Fully completed (has a stopReason) — a completed prior phase such as
	//      the read-file + ask_user message before a question answer.
	//   2. Not the message currently being streamed (different id from currentMessage)
	//      — guards the brief transition window where the same message is committed
	//      to history while currentMessage still references it.
	const currentMessageId = (currentMessage as { id?: string }).id;
	const deduped = activeTurnMessages.filter((message: HistoryMessage) => {
		if (message.role !== "assistant") return true;
		const stopReason = (message as unknown as { stopReason?: string })
			.stopReason;
		const messageId = (message as unknown as { id?: string }).id;
		return !!stopReason && messageId !== currentMessageId;
	});

	return [...previousTurns, ...deduped];
}

function hasFileOrImagePart(message: HistoryMessage): boolean {
	return message.content.some(
		(part: HistoryMessagePart) =>
			(part as Record<string, unknown>).type === "file" ||
			part.type === "image",
	);
}

function countFileMessages(messages: ListMessagesOutput): number {
	return messages.filter(
		(message: HistoryMessage) =>
			message.role === "user" && hasFileOrImagePart(message),
	).length;
}

function getLegacyImagePayload(
	payload: SessionInputs["sendMessage"]["payload"],
): Array<{ data: string; mimeType: string }> {
	const images = (payload as { images?: unknown }).images;
	if (!Array.isArray(images)) return [];
	return images.flatMap((image) => {
		const record = image as { data?: unknown; mimeType?: unknown };
		return typeof record.data === "string" &&
			typeof record.mimeType === "string"
			? [{ data: record.data, mimeType: record.mimeType }]
			: [];
	});
}

export function useChatDisplay(options: UseChatDisplayOptions) {
	const { sessionId, cwd, enabled = true, fps = 4 } = options;
	const utils = chatRuntimeServiceTrpc.useUtils();
	const [commandError, setCommandError] = useState<unknown>(null);
	const sessionCommandInput =
		sessionId === null ? null : { sessionId, ...(cwd ? { cwd } : {}) };
	const queryInput = sessionCommandInput ?? skipToken;
	const isQueryEnabled = enabled && Boolean(sessionId);
	const refetchIntervalMs = toRefetchIntervalMs(fps);
	const queryOptions = {
		enabled: isQueryEnabled,
		refetchInterval: refetchIntervalMs,
		refetchIntervalInBackground: true,
		refetchOnWindowFocus: false,
	} as const;

	const displayQuery = chatRuntimeServiceTrpc.session.getDisplayState.useQuery(
		queryInput,
		queryOptions,
	);

	const messagesQuery = chatRuntimeServiceTrpc.session.listMessages.useQuery(
		queryInput,
		queryOptions,
	);

	const displayState = displayQuery.data ?? null;
	const runtimeErrorMessage =
		typeof displayState?.errorMessage === "string" &&
		displayState.errorMessage.trim()
			? displayState.errorMessage
			: null;
	const currentMessage = displayState?.currentMessage ?? null;
	const isRunning = displayState?.isRunning ?? false;
	const isConversationLoading =
		isQueryEnabled &&
		messagesQuery.data === undefined &&
		(messagesQuery.isLoading || messagesQuery.isFetching);
	const historicalMessages = messagesQuery.data ?? [];
	const latestAssistantErrorMessage = isRunning
		? null
		: findLatestAssistantErrorMessage(historicalMessages);
	const [optimisticUserMessage, setOptimisticUserMessage] = useState<
		ListMessagesOutput[number] | null
	>(null);
	const optimisticTextRef = useRef<string | null>(null);
	const optimisticIdRef = useRef<string | null>(null);
	const fileMessageCountAtSendRef = useRef<number | null>(null);

	useEffect(() => {
		if (!optimisticIdRef.current) return;

		const optimisticText = optimisticTextRef.current;

		const found = optimisticText
			? historicalMessages.some(
					(message: HistoryMessage) =>
						message.role === "user" &&
						message.content.some(
							(part: HistoryMessagePart) =>
								part.type === "text" &&
								"text" in part &&
								part.text === optimisticText,
						),
				)
			: (() => {
					const currentFileMessageCount = countFileMessages(historicalMessages);
					return (
						fileMessageCountAtSendRef.current !== null &&
						currentFileMessageCount > fileMessageCountAtSendRef.current
					);
				})();
		if (!found) return;

		setOptimisticUserMessage(null);
		optimisticTextRef.current = null;
		optimisticIdRef.current = null;
		fileMessageCountAtSendRef.current = null;
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
				if (!sessionId) {
					const error = new Error(
						"Chat session is still starting. Please retry in a moment.",
					);
					setCommandError(error);
					throw error;
				}
				setCommandError(null);

				const text =
					typeof input.payload?.content === "string"
						? input.payload.content
						: "";
				const files = input.payload?.files ?? [];
				const legacyImages = getLegacyImagePayload(input.payload);
				if (text || files.length > 0 || legacyImages.length > 0) {
					const optimisticId = `optimistic-${Date.now()}`;
					optimisticTextRef.current = text || null;
					optimisticIdRef.current = optimisticId;
					if (!text) {
						fileMessageCountAtSendRef.current =
							countFileMessages(historicalMessages);
					}
					const content: ListMessagesOutput[number]["content"] = [];
					for (const file of files) {
						content.push({
							type: "file",
							data: file.data,
							mediaType: file.mediaType,
							filename: file.filename,
						} as unknown as ListMessagesOutput[number]["content"][number]);
					}
					for (const image of legacyImages) {
						content.push({
							type: "image",
							data: image.data,
							mimeType: image.mimeType,
						} as unknown as ListMessagesOutput[number]["content"][number]);
					}
					if (text) {
						content.push({
							type: "text",
							text,
						} as ListMessagesOutput[number]["content"][number]);
					}
					setOptimisticUserMessage({
						id: optimisticId,
						role: "user",
						content,
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
					optimisticIdRef.current = null;
					fileMessageCountAtSendRef.current = null;
					throw error;
				}
			},
			stop: async () => {
				if (!sessionCommandInput) return;
				setCommandError(null);
				try {
					return await utils.client.session.stop.mutate(sessionCommandInput);
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			abort: async () => {
				if (!sessionCommandInput) return;
				setCommandError(null);
				try {
					return await utils.client.session.abort.mutate(sessionCommandInput);
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			respondToApproval: async (
				input: Omit<SessionInputs["approval"]["respond"], "sessionId">,
			) => {
				if (!sessionCommandInput) return;
				setCommandError(null);
				try {
					return await utils.client.session.approval.respond.mutate({
						...sessionCommandInput,
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
				if (!sessionCommandInput) return;
				setCommandError(null);
				try {
					return await utils.client.session.question.respond.mutate({
						...sessionCommandInput,
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
				if (!sessionCommandInput) return;
				setCommandError(null);
				try {
					return await utils.client.session.plan.respond.mutate({
						...sessionCommandInput,
						...input,
					});
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
		}),
		[cwd, historicalMessages, sessionCommandInput, sessionId, utils],
	);

	return {
		...displayState,
		messages,
		isConversationLoading,
		error:
			runtimeErrorMessage ??
			latestAssistantErrorMessage ??
			displayQuery.error ??
			messagesQuery.error ??
			commandError ??
			null,
		commands,
	};
}

export type UseChatDisplayReturn = ReturnType<typeof useChatDisplay>;
