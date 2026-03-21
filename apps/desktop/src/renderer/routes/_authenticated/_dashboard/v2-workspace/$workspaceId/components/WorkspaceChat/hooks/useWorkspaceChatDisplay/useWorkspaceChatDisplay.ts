import type { AppRouter } from "@superset/host-service";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { workspaceTrpc } from "renderer/lib/workspace-trpc";

interface UseChatDisplayOptions {
	sessionId: string | null;
	workspaceId: string;
	enabled?: boolean;
	fps?: number;
}

const DEFAULT_ACTIVE_POLL_FPS = 30;
const MAX_ACTIVE_POLL_FPS = 30;
const IDLE_DISPLAY_REFRESH_INTERVAL_MS = 2_000;

function toActiveRefetchIntervalMs(fps: number): number {
	const normalizedFps =
		Number.isFinite(fps) && fps > 0
			? Math.min(fps, MAX_ACTIVE_POLL_FPS)
			: DEFAULT_ACTIVE_POLL_FPS;
	return Math.max(33, Math.floor(1000 / normalizedFps));
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
type OptimisticUserMessageEntry = {
	expectedPersistedUserCount: number;
	message: HistoryMessage;
};

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
		.filter((message) => message.role !== "assistant");

	return [...previousTurns, ...activeTurnNonAssistant];
}

function countUserMessages(messages: ListMessagesOutput): number {
	return messages.filter((message) => message.role === "user").length;
}

function toUserMessageSignature(message: HistoryMessage): string | null {
	if (message.role !== "user") return null;

	return message.content
		.map((part: HistoryMessagePart) => {
			if (part.type === "text") return `text:${part.text}`;
			if (part.type === "image") return `image:${part.mimeType}:${part.data}`;
			if ((part as { type?: string }).type === "file") {
				const filePart = part as {
					data?: string;
					filename?: string;
					mediaType?: string;
				};
				return `file:${filePart.mediaType ?? ""}:${filePart.filename ?? ""}:${filePart.data ?? ""}`;
			}
			return `${part.type}:${JSON.stringify(part)}`;
		})
		.join("||");
}

function reconcileOptimisticUserMessages({
	historicalMessages,
	optimisticMessages,
}: {
	historicalMessages: ListMessagesOutput;
	optimisticMessages: OptimisticUserMessageEntry[];
}): OptimisticUserMessageEntry[] {
	if (optimisticMessages.length === 0) {
		return optimisticMessages;
	}

	const historicalUserMessages = historicalMessages.filter(
		(message) => message.role === "user",
	);
	let consumedCount = 0;

	for (const optimisticMessage of optimisticMessages) {
		const persistedIndex = optimisticMessage.expectedPersistedUserCount - 1;
		if (persistedIndex >= historicalUserMessages.length) {
			break;
		}

		const persistedMessage = historicalUserMessages[persistedIndex];
		if (!persistedMessage) {
			break;
		}
		if (
			toUserMessageSignature(persistedMessage) !==
			toUserMessageSignature(optimisticMessage.message)
		) {
			break;
		}

		consumedCount += 1;
	}

	return consumedCount === 0
		? optimisticMessages
		: optimisticMessages.slice(consumedCount);
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
	const {
		sessionId,
		workspaceId,
		enabled = true,
		fps = DEFAULT_ACTIVE_POLL_FPS,
	} = options;
	const utils = workspaceTrpc.useUtils();
	const [commandError, setCommandError] = useState<unknown>(null);
	const queryInput =
		sessionId === null ? undefined : { sessionId, workspaceId };
	const isQueryEnabled = enabled && Boolean(sessionId);
	const activeRefetchIntervalMs = toActiveRefetchIntervalMs(fps);

	const displayQuery = workspaceTrpc.chat.getDisplayState.useQuery(
		queryInput as { sessionId: string; workspaceId: string },
		{
			enabled: isQueryEnabled && queryInput !== undefined,
			refetchInterval: (query) =>
				query.state.data?.isRunning
					? activeRefetchIntervalMs
					: IDLE_DISPLAY_REFRESH_INTERVAL_MS,
			refetchIntervalInBackground: false,
			refetchOnWindowFocus: true,
			staleTime: 0,
			gcTime: 0,
		},
	);

	const messagesQuery = workspaceTrpc.chat.listMessages.useQuery(
		queryInput as { sessionId: string; workspaceId: string },
		{
			enabled: isQueryEnabled && queryInput !== undefined,
			refetchInterval: false,
			refetchIntervalInBackground: false,
			refetchOnWindowFocus: true,
			staleTime: 0,
			gcTime: 0,
		},
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
	const historicalUserCount = countUserMessages(historicalMessages);
	const latestAssistantErrorMessage = isRunning
		? null
		: findLatestAssistantErrorMessage(historicalMessages);
	const [optimisticUserMessages, setOptimisticUserMessages] = useState<
		OptimisticUserMessageEntry[]
	>([]);
	const previousIsRunningRef = useRef(isRunning);

	const refreshChatQueries = useCallback(async () => {
		if (!queryInput) return;
		await Promise.all([
			utils.chat.getDisplayState.invalidate(queryInput),
			utils.chat.listMessages.invalidate(queryInput),
		]);
	}, [queryInput, utils.chat.getDisplayState, utils.chat.listMessages]);

	useEffect(() => {
		setCommandError(null);
		setOptimisticUserMessages([]);
	}, [sessionId, workspaceId]);

	useEffect(() => {
		setOptimisticUserMessages((existingMessages) =>
			reconcileOptimisticUserMessages({
				historicalMessages,
				optimisticMessages: existingMessages,
			}),
		);
	}, [historicalMessages]);

	useEffect(() => {
		const wasRunning = previousIsRunningRef.current;
		previousIsRunningRef.current = isRunning;

		if (!wasRunning || isRunning || !queryInput) {
			return;
		}

		void utils.chat.listMessages.invalidate(queryInput);
	}, [isRunning, queryInput, utils.chat.listMessages]);

	const messages = useMemo(() => {
		const withOptimistic =
			optimisticUserMessages.length > 0
				? [
						...historicalMessages,
						...optimisticUserMessages.map(({ message }) => message),
					]
				: historicalMessages;
		return withoutActiveTurnAssistantHistory({
			messages: withOptimistic,
			currentMessage,
			isRunning,
		});
	}, [historicalMessages, optimisticUserMessages, currentMessage, isRunning]);

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
				let optimisticMessageId: string | null = null;
				if (text || files.length > 0 || legacyImages.length > 0) {
					const optimisticId = `optimistic-${crypto.randomUUID()}`;
					optimisticMessageId = optimisticId;
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
					const optimisticMessage = {
						id: optimisticId,
						role: "user",
						content,
						createdAt: new Date(),
					} as ListMessagesOutput[number];
					setOptimisticUserMessages((existingMessages) => [
						...existingMessages,
						{
							expectedPersistedUserCount:
								historicalUserCount + existingMessages.length + 1,
							message: optimisticMessage,
						},
					]);
				}

				try {
					const result = await sendMessageMutation.mutateAsync({
						sessionId,
						workspaceId,
						...input,
					});
					void refreshChatQueries();
					return result;
				} catch (error) {
					setCommandError(error);
					if (optimisticMessageId) {
						setOptimisticUserMessages((existingMessages) =>
							existingMessages.filter(
								({ message }) => message.id !== optimisticMessageId,
							),
						);
					}
					throw error;
				}
			},
			stop: async () => {
				if (!queryInput) return;
				setCommandError(null);
				try {
					const result = await stopMutation.mutateAsync(queryInput);
					void refreshChatQueries();
					return result;
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
					const result = await respondToApprovalMutation.mutateAsync({
						...queryInput,
						...input,
					});
					void refreshChatQueries();
					return result;
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
					const result = await respondToQuestionMutation.mutateAsync({
						...queryInput,
						...input,
					});
					void refreshChatQueries();
					return result;
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
					const result = await respondToPlanMutation.mutateAsync({
						...queryInput,
						...input,
					});
					void refreshChatQueries();
					return result;
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
		}),
		[
			historicalUserCount,
			queryInput,
			refreshChatQueries,
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
