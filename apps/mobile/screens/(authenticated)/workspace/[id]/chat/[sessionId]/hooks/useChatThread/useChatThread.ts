import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import type {
	ChatMessage,
	ChatMessagePart,
	MessageMetadata,
	SendMessagePayload,
} from "@/lib/trpc/host-chat-types";
import { createHostClient } from "@/lib/trpc/host-client";

export type { ChatMessage } from "@/lib/trpc/host-chat-types";

// Poll cadence for the runtime snapshot (matches the desktop chat pane).
const FPS = 4;
const REFETCH_MS = Math.max(16, Math.floor(1000 / FPS));
const GC_MS = 60_000;

function findLastUserMessageIndex(messages: ChatMessage[]): number {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if (messages[i]?.role === "user") return i;
	}
	return -1;
}

/**
 * While a turn is streaming, the in-flight assistant turn is rendered from
 * `currentMessage`; drop those same assistant messages from history so they
 * aren't shown twice. (Simplified port of the desktop helper — we keep every
 * non-assistant message in the active turn.)
 */
function withoutActiveTurnAssistantHistory(
	messages: ChatMessage[],
	currentMessage: ChatMessage | null,
	isRunning: boolean,
): ChatMessage[] {
	if (!isRunning || !currentMessage || currentMessage.role !== "assistant") {
		return messages;
	}
	const start = findLastUserMessageIndex(messages) + 1;
	const previous = messages.slice(0, start);
	const activeNonAssistant = messages
		.slice(start)
		.filter((m) => m.role !== "assistant");
	return [...previous, ...activeNonAssistant];
}

function messageText(message: ChatMessage): string {
	return message.content
		.filter((p: ChatMessagePart) => p.type === "text")
		.map((p: ChatMessagePart) => p.text ?? "")
		.join("");
}

export interface UseChatThreadResult {
	/** Workspace/host resolution status. */
	hostId: string | null;
	organizationId: string | null;
	hostOnline: boolean;
	/** True until we know whether the workspace row exists in synced data. */
	workspaceResolving: boolean;
	/** Conversation. */
	messages: ChatMessage[];
	currentMessage: ChatMessage | null;
	isRunning: boolean;
	pendingApproval: Record<string, unknown> | null;
	pendingQuestion: Record<string, unknown> | null;
	pendingPlanApproval: Record<string, unknown> | null;
	isConversationLoading: boolean;
	error: string | null;
	/** Commands. */
	/** `model` is a catalog id; when set the host switches the thread to it
	 * before running the turn. Omit to keep the session's current model. */
	sendMessage: (text: string, model?: string) => Promise<void>;
	respondToApproval: (
		decision: "approve" | "decline" | "always_allow_category",
	) => Promise<void>;
	respondToQuestion: (questionId: string, answer: string) => Promise<void>;
	respondToPlan: (
		planId: string,
		action: "approved" | "rejected",
		feedback?: string,
	) => Promise<void>;
	isSending: boolean;
}

export function useChatThread(params: {
	sessionId: string;
	workspaceId: string;
}): UseChatThreadResult {
	const { sessionId, workspaceId } = params;
	const { workspace, host, isResolving } = useWorkspaceHost(workspaceId);
	const organizationId = workspace?.organizationId ?? null;
	const hostId = workspace?.hostId ?? null;
	const hostOnline = host?.isOnline ?? false;
	const workspaceResolving = isResolving;

	const client = useMemo(() => {
		if (!organizationId || !hostId) return null;
		return createHostClient({ organizationId, hostId });
	}, [organizationId, hostId]);

	const queryEnabled = Boolean(client && sessionId && workspaceId);

	const snapshotQuery = useQuery({
		queryKey: ["chat-snapshot", organizationId, hostId, workspaceId, sessionId],
		enabled: queryEnabled,
		refetchInterval: REFETCH_MS,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
		gcTime: GC_MS,
		queryFn: async () => {
			if (!client) throw new Error("Host client unavailable");
			return client.chat.getSnapshot.query({ sessionId, workspaceId });
		},
	});

	const snapshot = snapshotQuery.data ?? null;
	const displayState = snapshot?.displayState ?? null;
	const currentMessage = displayState?.currentMessage ?? null;
	const isRunning = displayState?.isRunning ?? false;
	const pendingApproval = displayState?.pendingApproval ?? null;
	const pendingQuestion = displayState?.pendingQuestion ?? null;
	const pendingPlanApproval = displayState?.pendingPlanApproval ?? null;
	const historicalMessages: ChatMessage[] = snapshot?.messages ?? [];

	// Optimistic user message (cleared once it appears in synced history).
	const [optimistic, setOptimistic] = useState<ChatMessage | null>(null);
	const optimisticTextRef = useRef<string | null>(null);
	useEffect(() => {
		if (!optimisticTextRef.current) return;
		const text = optimisticTextRef.current;
		const found = historicalMessages.some(
			(m) => m.role === "user" && messageText(m) === text,
		);
		if (found) {
			setOptimistic(null);
			optimisticTextRef.current = null;
		}
	}, [historicalMessages]);

	const messages = useMemo(() => {
		const withOptimistic = optimistic
			? [...historicalMessages, optimistic]
			: historicalMessages;
		return withoutActiveTurnAssistantHistory(
			withOptimistic,
			currentMessage,
			isRunning,
		);
	}, [historicalMessages, optimistic, currentMessage, isRunning]);

	const sendMutation = useMutation({
		mutationFn: async (vars: {
			payload: SendMessagePayload;
			metadata?: MessageMetadata;
		}) => {
			if (!client) throw new Error("Host client unavailable");
			return client.chat.sendMessage.mutate({
				sessionId,
				workspaceId,
				payload: vars.payload,
				metadata: vars.metadata,
			});
		},
	});
	const approvalMutation = useMutation({
		mutationFn: async (
			decision: "approve" | "decline" | "always_allow_category",
		) => {
			if (!client) throw new Error("Host client unavailable");
			return client.chat.respondToApproval.mutate({
				sessionId,
				workspaceId,
				payload: { decision },
			});
		},
	});
	const questionMutation = useMutation({
		mutationFn: async (vars: { questionId: string; answer: string }) => {
			if (!client) throw new Error("Host client unavailable");
			return client.chat.respondToQuestion.mutate({
				sessionId,
				workspaceId,
				payload: vars,
			});
		},
	});
	const planMutation = useMutation({
		mutationFn: async (vars: {
			planId: string;
			response: { action: "approved" | "rejected"; feedback?: string };
		}) => {
			if (!client) throw new Error("Host client unavailable");
			return client.chat.respondToPlan.mutate({
				sessionId,
				workspaceId,
				payload: vars,
			});
		},
	});

	const sendMessage = useCallback(
		async (text: string, model?: string) => {
			const trimmed = text.trim();
			if (!trimmed) return;
			optimisticTextRef.current = trimmed;
			setOptimistic({
				id: `optimistic-${trimmed.length}-${trimmed.slice(0, 8)}`,
				role: "user",
				content: [{ type: "text", text: trimmed }],
				createdAt: new Date(),
			});
			try {
				await sendMutation.mutateAsync({
					payload: { content: trimmed },
					// The host switches the thread's model before the turn when set;
					// omitted → keep the current model.
					metadata: model ? { model } : undefined,
				});
			} catch (err) {
				setOptimistic(null);
				optimisticTextRef.current = null;
				throw err;
			}
		},
		[sendMutation],
	);

	const respondToApproval = useCallback(
		async (decision: "approve" | "decline" | "always_allow_category") => {
			await approvalMutation.mutateAsync(decision);
		},
		[approvalMutation],
	);
	const respondToQuestion = useCallback(
		async (questionId: string, answer: string) => {
			await questionMutation.mutateAsync({ questionId, answer });
		},
		[questionMutation],
	);
	const respondToPlan = useCallback(
		async (
			planId: string,
			action: "approved" | "rejected",
			feedback?: string,
		) => {
			await planMutation.mutateAsync({
				planId,
				response: { action, feedback },
			});
		},
		[planMutation],
	);

	const runtimeError =
		typeof displayState?.errorMessage === "string" &&
		displayState.errorMessage.trim()
			? displayState.errorMessage.trim()
			: null;
	const queryError = snapshotQuery.error
		? snapshotQuery.error instanceof Error
			? snapshotQuery.error.message
			: String(snapshotQuery.error)
		: null;

	return {
		hostId,
		organizationId,
		hostOnline,
		workspaceResolving,
		messages,
		currentMessage,
		isRunning,
		pendingApproval,
		pendingQuestion,
		pendingPlanApproval,
		isConversationLoading:
			queryEnabled &&
			snapshotQuery.data === undefined &&
			snapshotQuery.isLoading,
		error: runtimeError ?? queryError,
		sendMessage,
		respondToApproval,
		respondToQuestion,
		respondToPlan,
		isSending: sendMutation.isPending,
	};
}
