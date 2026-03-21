import { skipToken } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useCallback, useEffect, useMemo, useState } from "react";
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
}

const DEFAULT_ACTIVE_POLL_FPS = 30;
const MAX_ACTIVE_POLL_FPS = 30;

export function toActiveRefetchIntervalMs(fps: number): number {
	const normalizedFps =
		Number.isFinite(fps) && fps > 0
			? Math.min(fps, MAX_ACTIVE_POLL_FPS)
			: DEFAULT_ACTIVE_POLL_FPS;
	return Math.max(33, Math.floor(1000 / normalizedFps));
}

interface ScopedDisplayState {
	scopeKey: string;
	displayState: DisplayStateOutput;
}

interface OptimisticUserMessageEntry {
	expectedPersistedUserCount: number;
	message: HistoryMessage;
}

export function toDisplayStateScopeKey(
	sessionId: string | null,
	cwd?: string,
): string {
	return `${sessionId ?? ""}:${cwd ?? ""}`;
}

export function resolveScopedDisplayState(
	scopeKey: string,
	liveDisplayState: ScopedDisplayState | null,
	queryDisplayState: DisplayStateOutput | undefined,
): DisplayStateOutput | null {
	if (liveDisplayState?.scopeKey === scopeKey) {
		return liveDisplayState.displayState;
	}
	return queryDisplayState ?? null;
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
	const activeTurnNonAssistant = messages
		.slice(turnStartIndex)
		.filter((message: HistoryMessage) => message.role !== "assistant");

	return [...previousTurns, ...activeTurnNonAssistant];
}

function countUserMessages(messages: ListMessagesOutput): number {
	return messages.filter((message: HistoryMessage) => message.role === "user")
		.length;
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

export function reconcileOptimisticUserMessages({
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
		(message: HistoryMessage) => message.role === "user",
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
	const { sessionId, cwd, enabled = true } = options;
	const utils = chatRuntimeServiceTrpc.useUtils();
	const [commandError, setCommandError] = useState<unknown>(null);
	const displayStateScopeKey = toDisplayStateScopeKey(sessionId, cwd);
	const sessionCommandInput =
		sessionId === null ? null : { sessionId, ...(cwd ? { cwd } : {}) };
	const queryInput = sessionCommandInput ?? skipToken;
	const isQueryEnabled = enabled && Boolean(sessionId);

	const displayQuery = chatRuntimeServiceTrpc.session.getDisplayState.useQuery(
		queryInput,
		{
			enabled: isQueryEnabled,
			refetchOnWindowFocus: true,
			staleTime: 0,
			gcTime: 0,
		},
	);

	const messagesQuery = chatRuntimeServiceTrpc.session.listMessages.useQuery(
		queryInput,
		{
			enabled: isQueryEnabled,
			refetchInterval: false,
			refetchIntervalInBackground: false,
			refetchOnWindowFocus: true,
			staleTime: 0,
			gcTime: 0,
		},
	);

	const isConversationLoading =
		isQueryEnabled &&
		messagesQuery.data === undefined &&
		(messagesQuery.isLoading || messagesQuery.isFetching);
	const historicalMessages = messagesQuery.data ?? [];
	const historicalUserCount = countUserMessages(historicalMessages);
	const [optimisticUserMessages, setOptimisticUserMessages] = useState<
		OptimisticUserMessageEntry[]
	>([]);
	const [liveDisplayState, setLiveDisplayState] =
		useState<ScopedDisplayState | null>(null);

	const refreshMessages = useCallback(async () => {
		if (!sessionCommandInput) return;
		await utils.session.listMessages.invalidate(sessionCommandInput);
	}, [sessionCommandInput, utils.session.listMessages]);

	useEffect(() => {
		setLiveDisplayState(null);
		setCommandError(null);
		setOptimisticUserMessages([]);
	}, [displayStateScopeKey]);

	useEffect(() => {
		setOptimisticUserMessages((existingMessages) =>
			reconcileOptimisticUserMessages({
				historicalMessages,
				optimisticMessages: existingMessages,
			}),
		);
	}, [historicalMessages]);

	chatRuntimeServiceTrpc.session.subscribe.useSubscription(
		isQueryEnabled && sessionCommandInput ? sessionCommandInput : skipToken,
		{
			onData: (event) => {
				setLiveDisplayState({
					scopeKey: displayStateScopeKey,
					displayState: event.displayState,
				});

				if (sessionCommandInput && event.messagesChanged) {
					void utils.session.listMessages.invalidate(sessionCommandInput);
				}
			},
			onError: () => {
				setLiveDisplayState(null);
				void displayQuery.refetch();
				void refreshMessages();
			},
		},
	);

	const displayState = resolveScopedDisplayState(
		displayStateScopeKey,
		liveDisplayState,
		displayQuery.data,
	);
	const runtimeErrorMessage =
		typeof displayState?.errorMessage === "string" &&
		displayState.errorMessage.trim()
			? displayState.errorMessage
			: null;
	const currentMessage = displayState?.currentMessage ?? null;
	const isRunning = displayState?.isRunning ?? false;
	const latestAssistantErrorMessage = isRunning
		? null
		: findLatestAssistantErrorMessage(historicalMessages);

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
					const result = await utils.client.session.sendMessage.mutate({
						sessionId,
						...(cwd ? { cwd } : {}),
						...input,
					});
					void refreshMessages();
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
				if (!sessionCommandInput) return;
				setCommandError(null);
				try {
					const result =
						await utils.client.session.stop.mutate(sessionCommandInput);
					void refreshMessages();
					return result;
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
			abort: async () => {
				if (!sessionCommandInput) return;
				setCommandError(null);
				try {
					const result =
						await utils.client.session.abort.mutate(sessionCommandInput);
					void refreshMessages();
					return result;
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
					const result = await utils.client.session.approval.respond.mutate({
						...sessionCommandInput,
						...input,
					});
					void refreshMessages();
					return result;
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
					const result = await utils.client.session.question.respond.mutate({
						...sessionCommandInput,
						...input,
					});
					void refreshMessages();
					return result;
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
					const result = await utils.client.session.plan.respond.mutate({
						...sessionCommandInput,
						...input,
					});
					void refreshMessages();
					return result;
				} catch (error) {
					setCommandError(error);
					return;
				}
			},
		}),
		[
			cwd,
			historicalUserCount,
			refreshMessages,
			sessionCommandInput,
			sessionId,
			utils,
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
