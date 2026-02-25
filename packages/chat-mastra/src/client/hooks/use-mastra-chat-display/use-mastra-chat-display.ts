import { skipToken } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMastraServiceRouter } from "../../../server/trpc";
import { chatMastraServiceTrpc } from "../../provider";

type RouterInputs = inferRouterInputs<ChatMastraServiceRouter>;
type RouterOutputs = inferRouterOutputs<ChatMastraServiceRouter>;

type SessionInputs = RouterInputs["session"];
type SessionOutputs = RouterOutputs["session"];

type DisplayStateOutput = SessionOutputs["getDisplayState"];
export type MastraChatDisplayState = Exclude<
	DisplayStateOutput["displayState"],
	undefined
>;

export interface UseMastraChatDisplayOptions {
	sessionId: string | null;
	workspaceId?: string;
	cwd?: string;
	organizationId?: string | null;
	enabled?: boolean;
	fps?: number;
}

function toRefetchIntervalMs(fps: number): number {
	if (!Number.isFinite(fps) || fps <= 0) return Math.floor(1000 / 60);
	return Math.max(16, Math.floor(1000 / fps));
}

export function useMastraChatDisplay(options: UseMastraChatDisplayOptions) {
	const {
		sessionId,
		workspaceId,
		cwd,
		organizationId,
		enabled = true,
		fps = 60,
	} = options;

	const [runtimeReason, setRuntimeReason] = useState<string | null>(null);
	const startedOrgRef = useRef<string | null>(null);

	const startMutation = chatMastraServiceTrpc.start.useMutation();
	const ensureRuntimeMutation =
		chatMastraServiceTrpc.session.ensureRuntime.useMutation();
	const sendMessageMutation =
		chatMastraServiceTrpc.session.sendMessage.useMutation();
	const controlMutation = chatMastraServiceTrpc.session.control.useMutation();
	const approvalMutation =
		chatMastraServiceTrpc.session.approval.respond.useMutation();
	const questionMutation =
		chatMastraServiceTrpc.session.question.respond.useMutation();
	const planMutation = chatMastraServiceTrpc.session.plan.respond.useMutation();

	const displayQuery = chatMastraServiceTrpc.session.getDisplayState.useQuery(
		sessionId ? { sessionId } : skipToken,
		{
			enabled: enabled && Boolean(sessionId),
			refetchInterval: toRefetchIntervalMs(fps),
			refetchIntervalInBackground: true,
			refetchOnWindowFocus: false,
			staleTime: 0,
			gcTime: 0,
		},
	);

	const ensureRuntimeReady = useCallback(async (): Promise<boolean> => {
		if (!sessionId) {
			setRuntimeReason("Missing session id");
			return false;
		}

		if (!organizationId) {
			setRuntimeReason("Missing organization id");
			return false;
		}

		try {
			if (startedOrgRef.current !== organizationId) {
				await startMutation.mutateAsync({ organizationId });
				startedOrgRef.current = organizationId;
			}

			const runtime = await ensureRuntimeMutation.mutateAsync({
				sessionId,
				...(cwd ? { cwd } : {}),
				...(workspaceId ? { workspaceId } : {}),
			});

			if (!runtime.ready) {
				setRuntimeReason(runtime.reason ?? "Runtime not ready");
				return false;
			}

			setRuntimeReason(null);
			return true;
		} catch (error) {
			setRuntimeReason(
				error instanceof Error ? error.message : "Failed to ensure runtime",
			);
			return false;
		}
	}, [
		cwd,
		ensureRuntimeMutation,
		organizationId,
		sessionId,
		startMutation,
		workspaceId,
	]);

	useEffect(() => {
		if (!enabled || !sessionId || !organizationId) return;
		void ensureRuntimeReady();
	}, [enabled, ensureRuntimeReady, organizationId, sessionId]);

	const sendMessage = useCallback(
		async (
			input: Omit<SessionInputs["sendMessage"], "sessionId">,
		): Promise<{ accepted: boolean }> => {
			if (!(await ensureRuntimeReady()) || !sessionId) {
				return { accepted: false };
			}
			const result = await sendMessageMutation.mutateAsync({
				sessionId,
				...input,
			});
			void displayQuery.refetch();
			return result;
		},
		[displayQuery, ensureRuntimeReady, sendMessageMutation, sessionId],
	);

	const control = useCallback(
		async (
			input: Omit<SessionInputs["control"], "sessionId">,
		): Promise<{ accepted: boolean }> => {
			if (!sessionId) return { accepted: false };
			const result = await controlMutation.mutateAsync({ sessionId, ...input });
			void displayQuery.refetch();
			return result;
		},
		[controlMutation, displayQuery, sessionId],
	);

	const respondToApproval = useCallback(
		async (
			input: Omit<SessionInputs["approval"]["respond"], "sessionId">,
		): Promise<{ accepted: boolean }> => {
			if (!sessionId) return { accepted: false };
			const result = await approvalMutation.mutateAsync({
				sessionId,
				...input,
			});
			void displayQuery.refetch();
			return result;
		},
		[approvalMutation, displayQuery, sessionId],
	);

	const respondToQuestion = useCallback(
		async (
			input: Omit<SessionInputs["question"]["respond"], "sessionId">,
		): Promise<{ accepted: boolean }> => {
			if (!sessionId) return { accepted: false };
			const result = await questionMutation.mutateAsync({
				sessionId,
				...input,
			});
			void displayQuery.refetch();
			return result;
		},
		[displayQuery, questionMutation, sessionId],
	);

	const respondToPlan = useCallback(
		async (
			input: Omit<SessionInputs["plan"]["respond"], "sessionId">,
		): Promise<{ accepted: boolean }> => {
			if (!sessionId) return { accepted: false };
			const result = await planMutation.mutateAsync({ sessionId, ...input });
			void displayQuery.refetch();
			return result;
		},
		[displayQuery, planMutation, sessionId],
	);

	const ready = displayQuery.data?.ready ?? false;
	const reason = runtimeReason ?? displayQuery.data?.reason ?? null;
	const displayState = ready
		? (displayQuery.data?.displayState as MastraChatDisplayState)
		: null;

	return {
		ready,
		reason,
		displayState,
		isLoading: displayQuery.isLoading || ensureRuntimeMutation.isPending,
		error:
			displayQuery.error ??
			startMutation.error ??
			ensureRuntimeMutation.error ??
			sendMessageMutation.error ??
			controlMutation.error ??
			approvalMutation.error ??
			questionMutation.error ??
			planMutation.error,
		refetch: displayQuery.refetch,
		sendMessage,
		control,
		respondToApproval,
		respondToQuestion,
		respondToPlan,
	};
}

export type UseMastraChatDisplayReturn = ReturnType<
	typeof useMastraChatDisplay
>;
