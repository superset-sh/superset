import { skipToken } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useMemo } from "react";
import type { ChatMastraServiceRouter } from "../../../server/trpc";
import { chatMastraServiceTrpc } from "../../provider";

type RouterInputs = inferRouterInputs<ChatMastraServiceRouter>;
type RouterOutputs = inferRouterOutputs<ChatMastraServiceRouter>;

type SessionInputs = RouterInputs["session"];
type SessionOutputs = RouterOutputs["session"];

type DisplayStateOutput = SessionOutputs["getDisplayState"];
export type MastraChatDisplayState = DisplayStateOutput;

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

	const displayState = displayQuery.data ?? null;
	const commands = useMemo(
		() => ({
			sendMessage: async (
				input: Omit<SessionInputs["sendMessage"], "sessionId">,
			) => {
				if (!sessionId) return;
				return utils.client.session.sendMessage.mutate({
					sessionId,
					...(cwd ? { cwd } : {}),
					...input,
				});
			},
			stop: async () => {
				if (!sessionId) return;
				return utils.client.session.stop.mutate({ sessionId });
			},
			abort: async () => {
				if (!sessionId) return;
				return utils.client.session.abort.mutate({ sessionId });
			},
			respondToApproval: async (
				input: Omit<SessionInputs["approval"]["respond"], "sessionId">,
			) => {
				if (!sessionId) return;
				return utils.client.session.approval.respond.mutate({
					sessionId,
					...input,
				});
			},
			respondToQuestion: async (
				input: Omit<SessionInputs["question"]["respond"], "sessionId">,
			) => {
				if (!sessionId) return;
				return utils.client.session.question.respond.mutate({
					sessionId,
					...input,
				});
			},
			respondToPlan: async (
				input: Omit<SessionInputs["plan"]["respond"], "sessionId">,
			) => {
				if (!sessionId) return;
				return utils.client.session.plan.respond.mutate({
					sessionId,
					...input,
				});
			},
		}),
		[cwd, sessionId, utils],
	);

	return {
		...displayState,
		commands,
	};
}

export type UseMastraChatDisplayReturn = ReturnType<
	typeof useMastraChatDisplay
>;
