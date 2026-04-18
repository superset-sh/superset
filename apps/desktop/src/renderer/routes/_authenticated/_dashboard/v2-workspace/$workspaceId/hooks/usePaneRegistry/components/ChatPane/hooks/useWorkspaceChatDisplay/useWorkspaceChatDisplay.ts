import type { AppRouter } from "@superset/host-service";
import { workspaceTrpc } from "@superset/workspace-client";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useEffect, useMemo, useRef, useState } from "react";
import { hasAnsweredQuestionToolCall } from "renderer/components/Chat/ChatInterface/utils/messageHelpers";

interface UseChatDisplayOptions {
	sessionId: string | null;
	workspaceId: string;
	enabled?: boolean;
	fps?: number;
}

function toRefetchIntervalMs(fps: number): number {
	if (!Number.isFinite(fps) || fps <= 0) return Math.floor(1000 / 60);
	return Math.max(16, Math.floor(1000 / fps));
}

type RouterInputs = inferRouterInputs<AppRouter>;
type RouterOutputs = inferRouterOutputs<AppRouter>;
type ChatInputs = RouterInputs["chat"];
type ChatOutputs = RouterOutputs["chat"];
type DisplayStateOutput = ChatOutputs["getDisplayState"];
type ListMessagesOutput = ChatOutputs["listMessages"];
type HistoryMessage = ListMessagesOutput[number];
type HistoryMessagePart = HistoryMessage["content"][number];
type SendMessageInput = ChatInputs["sendMessage"];

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

function withoutActiveTurnAssistantHistory({
	messages,
	currentMessage,
	isRunning,
}: {
	messages: ListMessagesOutput;
	currentMessage: NonNullable<DisplayStateOutput>["currentMessage"] | null;
	isRunning: boolean;
}): ListMessagesOutput {
	if (!isRunning || !currentMessage || currentMessage.role !== "assistant") {
		return messages;
	}

	const turnStartIndex = findLastUserMessageIndex(messages) + 1;
	const previousTurns = messages.slice(0, turnStartIndex);
	const activeTurnNonAssistant = messages
		.slice(turnStartIndex)
		.filter(
			(message) =>
				message.role !== "assistant" || hasAnsweredQuestionToolCall(message),
		);

	return [...previousTurns, ...activeTurnNonAssistant];
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
		(message) => message.role === "user" && hasFileOrImagePart(message),
	).length;
}

function getLegacyImagePayload(
	payload: SendMessageInput["payload"],
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
	const { sessionId, workspaceId, enabled = true, fps = 4 } = options;
	const [commandError, setCommandError] = useState<unknown>(null);
	const queryInput =
		sessionId === null ? undefined : { sessionId, workspaceId };
	const isQueryEnabled = enabled && Boolean(sessionId);
	const refetchIntervalMs = toRefetchIntervalMs(fps);
	const queryOptions = {
		enabled: isQueryEnabled && queryInput !== undefined,
		refetchInterval: refetchIntervalMs,
		refetchIntervalInBackground: true,
		refetchOnWindowFocus: false,
	} as const;

	const displayQuery = workspaceTrpc.chat.getDisplayState.useQuery(
		queryInput as { sessionId: string; workspaceId: string },
		queryOptions,
	);

	const messagesQuery = workspaceTrpc.chat.listMessages.useQuery(
		queryInput as { sessionId: string; workspaceId: string },
		queryOptions,
	);

	const sendMessageMutation = workspaceTrpc.chat.sendMessage.useMutation();
	const stopMutation = workspaceTrpc.chat.stop.useMutation();
	const respondToApprovalMutation =
		workspaceTrpc.chat.respondToApproval.useMutation();
	const respondToQuestionMutation =
		workspaceTrpc.chat.respondToQuestion.useMutation();
	const respondToPlanMutation = workspaceTrpc.chat.respondToPlan.useMutation();

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
					(message) =>
						message.role === "user" &&
						message.content.some(
							(part) =>
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
				input: Omit<SendMessageInput, "sessionId" | "workspaceId">,
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
					return await sendMessageMutation.mutateAsync({
						sessionId,
						workspaceId,
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
				if (!queryInput) return;
				setCommandError(null);
				try {
					return await stopMutation.mutateAsync(queryInput);
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			abort: async () => undefined,
			respondToApproval: async (input: {
				payload: { decision: "approve" | "decline" | "always_allow_category" };
			}) => {
				if (!queryInput) return;
				setCommandError(null);
				try {
					return await respondToApprovalMutation.mutateAsync({
						...queryInput,
						...input,
					});
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			respondToQuestion: async (input: {
				payload: { questionId: string; answer: string };
			}) => {
				if (!queryInput) return;
				setCommandError(null);
				try {
					return await respondToQuestionMutation.mutateAsync({
						...queryInput,
						...input,
					});
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			respondToPlan: async (input: {
				payload: {
					planId: string;
					response: { action: "approved" | "rejected"; feedback?: string };
				};
			}) => {
				if (!queryInput) return;
				setCommandError(null);
				try {
					return await respondToPlanMutation.mutateAsync({
						...queryInput,
						...input,
					});
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
		}),
		[
			historicalMessages,
			queryInput,
			respondToApprovalMutation,
			respondToPlanMutation,
			respondToQuestionMutation,
			sendMessageMutation,
			sessionId,
			stopMutation,
			workspaceId,
		],
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
