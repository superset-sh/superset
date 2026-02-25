import { skipToken } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useMemo, useState } from "react";
import type { ChatMastraServiceRouter } from "../../../server/trpc";
import { chatMastraServiceTrpc } from "../../provider";
import { useMessages } from "./hooks/use-messages";

type RouterInputs = inferRouterInputs<ChatMastraServiceRouter>;
type RouterOutputs = inferRouterOutputs<ChatMastraServiceRouter>;

type SessionInputs = RouterInputs["session"];
type SessionOutputs = RouterOutputs["session"];

type DisplayStateOutput = SessionOutputs["getDisplayState"];
type ListMessagesOutput = SessionOutputs["listMessages"];

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
	const historicalMessages = messagesQuery.data ?? [];
	const isRunning = displayState?.isRunning ?? false;

	const { messages, addOptimisticUserMessage, clearOptimistic } = useMessages({
		historicalMessages,
		currentMessage,
		isRunning,
	});

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
					addOptimisticUserMessage(text);
				}

				try {
					return await utils.client.session.sendMessage.mutate({
						sessionId,
						...(cwd ? { cwd } : {}),
						...input,
					});
				} catch (error) {
					setCommandError(error);
					clearOptimistic();
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
		[addOptimisticUserMessage, clearOptimistic, cwd, sessionId, utils],
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
