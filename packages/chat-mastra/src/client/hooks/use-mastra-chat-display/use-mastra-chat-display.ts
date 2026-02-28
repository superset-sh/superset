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

const AI_API_CALL_ERROR_PREFIX = /^\s*AI_APICallError\d*:\s*/;
const MAX_ERROR_PARSE_DEPTH = 10;
const GENERIC_ERROR_TOKENS = new Set([
	"error",
	"workspace_error",
	"agent_start",
	"agent_end",
]);

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

function toNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeErrorMessage(message: string): string {
	let normalized = message.trim();
	while (AI_API_CALL_ERROR_PREFIX.test(normalized)) {
		normalized = normalized.replace(AI_API_CALL_ERROR_PREFIX, "").trim();
	}
	return normalized;
}

function toUserFacingErrorMessage(message: string): string | null {
	const normalized = normalizeErrorMessage(message);
	if (normalized.length === 0) return null;
	const lower = normalized.toLowerCase();
	if (GENERIC_ERROR_TOKENS.has(lower)) return null;
	return normalized;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function extractErrorMessageFromUnknown(
	value: unknown,
	seen: WeakSet<object>,
	depth = 0,
): string | null {
	if (depth > MAX_ERROR_PARSE_DEPTH) return null;

	const asString = toNonEmptyString(value);
	if (asString) {
		return toUserFacingErrorMessage(asString);
	}

	if (value instanceof Error) {
		const message = toNonEmptyString(value.message);
		if (message) return normalizeErrorMessage(message);
		const causeMessage = extractErrorMessageFromUnknown(
			(value as Error & { cause?: unknown }).cause,
			seen,
			depth + 1,
		);
		if (causeMessage) return causeMessage;
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			const nested = extractErrorMessageFromUnknown(item, seen, depth + 1);
			if (nested) return nested;
		}
		return null;
	}

	const record = asRecord(value);
	if (!record) return null;
	if (seen.has(record)) return null;
	seen.add(record);

	const preferredKeys = [
		"userFacingMessage",
		"displayMessage",
		"error",
		"cause",
		"data",
		"details",
		"responseBody",
		"body",
		"payload",
		"result",
	];
	for (const key of preferredKeys) {
		const nested = extractErrorMessageFromUnknown(record[key], seen, depth + 1);
		if (nested) return nested;
	}

	const messageKeys = ["message", "errorMessage", "reason", "text"];
	for (const key of messageKeys) {
		const message = toNonEmptyString(record[key]);
		if (!message) continue;
		const normalized = toUserFacingErrorMessage(message);
		if (normalized) return normalized;
	}

	for (const nestedValue of Object.values(record)) {
		const nested = extractErrorMessageFromUnknown(nestedValue, seen, depth + 1);
		if (nested) return nested;
	}

	return null;
}

function extractErrorMessage(value: unknown): string | null {
	return extractErrorMessageFromUnknown(value, new WeakSet(), 0);
}

function getAssistantMessageErrorMessage(message: HistoryMessage): string | null {
	if (message.role !== "assistant") return null;

	const messageRecord = asRecord(message);
	if (!messageRecord) return null;

	const directError = extractErrorMessage(messageRecord.error);
	if (directError) return directError;

	const metadata = asRecord(messageRecord.metadata);
	if (metadata) {
		const metadataError = extractErrorMessage(metadata.error);
		if (metadataError) return metadataError;
	}

	if (!Array.isArray(messageRecord.content)) return null;

	for (const part of messageRecord.content) {
		const contentPart = asRecord(part);
		if (!contentPart || contentPart.type !== "error") continue;
		const partError = extractErrorMessage(
			contentPart.error ?? contentPart.text ?? contentPart.message,
		);
		if (partError) return partError;
	}

	return null;
}

export function findLatestAssistantErrorMessage(
	messages: ListMessagesOutput,
): string | null {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (!message || message.role !== "assistant") continue;
		return getAssistantMessageErrorMessage(message);
	}
	return null;
}

export function resolveChatErrorMessage({
	displayState,
	messages,
}: {
	displayState: DisplayStateOutput | null;
	messages: ListMessagesOutput;
}): string | null {
	const runtimeError = extractErrorMessage(
		asRecord(displayState)?.errorMessage ?? null,
	);
	if (runtimeError) return runtimeError;
	return findLatestAssistantErrorMessage(messages);
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
	const errorMessage = useMemo(
		() =>
			resolveChatErrorMessage({
				displayState,
				messages: historicalMessages,
			}),
		[displayState, historicalMessages],
	);

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
		errorMessage,
		error: displayQuery.error ?? messagesQuery.error ?? commandError ?? null,
		commands,
	};
}

export type UseMastraChatDisplayReturn = ReturnType<
	typeof useMastraChatDisplay
>;
