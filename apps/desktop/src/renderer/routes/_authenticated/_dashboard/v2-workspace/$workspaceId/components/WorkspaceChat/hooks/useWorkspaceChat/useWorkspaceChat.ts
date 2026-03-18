import type { AppRouter } from "@superset/host-service";
import { eq, useLiveQuery } from "@tanstack/react-db";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import { workspaceTrpc } from "renderer/lib/workspace-trpc";
import { env } from "renderer/env.renderer";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useChatPreferencesStore } from "renderer/stores/chat-preferences";

type HostServiceOutputs = inferRouterOutputs<AppRouter>;
export type WorkspaceChatDisplayState =
	HostServiceOutputs["chat"]["getDisplayState"];
export type WorkspaceChatMessage =
	HostServiceOutputs["chat"]["listMessages"][number];
const apiUrl = env.NEXT_PUBLIC_API_URL;

interface SessionSelectorItem {
	sessionId: string;
	title: string;
	updatedAt: Date;
}

function toSessionSelectorItem(session: {
	id: string;
	title: string | null;
	lastActiveAt: Date | string | null;
	createdAt: Date | string;
}): SessionSelectorItem {
	return {
		sessionId: session.id,
		title: session.title ?? "",
		updatedAt:
			session.lastActiveAt instanceof Date
				? session.lastActiveAt
				: session.lastActiveAt
					? new Date(session.lastActiveAt)
					: session.createdAt instanceof Date
						? session.createdAt
						: new Date(session.createdAt),
	};
}

async function getHttpErrorDetail(response: Response): Promise<string> {
	const errorBody = await response
		.text()
		.then((text) => text.trim())
		.catch(() => "");
	const statusText = response.statusText ? ` ${response.statusText}` : "";
	const detail = errorBody ? ` - ${errorBody.slice(0, 500)}` : "";
	return `${response.status}${statusText}${detail}`;
}

async function createSessionRecord(input: {
	sessionId: string;
	organizationId: string;
	workspaceId: string;
}): Promise<void> {
	const token = getAuthToken();
	const response = await fetch(`${apiUrl}/api/chat/${input.sessionId}`, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({
			organizationId: input.organizationId,
			workspaceId: input.workspaceId,
		}),
	});

	if (!response.ok) {
		const detail = await getHttpErrorDetail(response);
		throw new Error(`Failed to create session ${input.sessionId}: ${detail}`);
	}
}

async function deleteSessionRecord(sessionId: string): Promise<void> {
	const token = getAuthToken();
	const response = await fetch(`${apiUrl}/api/chat/${sessionId}/stream`, {
		method: "DELETE",
		headers: token ? { Authorization: `Bearer ${token}` } : {},
	});

	if (!response.ok) {
		const detail = await getHttpErrorDetail(response);
		throw new Error(`Failed to delete session ${sessionId}: ${detail}`);
	}
}

export function useWorkspaceChat({
	workspaceId,
}: {
	workspaceId: string;
}) {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [isSessionInitializing, setIsSessionInitializing] = useState(false);
	const selectedModelId = useChatPreferencesStore(
		(state) => state.selectedModelId,
	);
	const setSelectedModelId = useChatPreferencesStore(
		(state) => state.setSelectedModelId,
	);
	const thinkingLevel = useChatPreferencesStore((state) => state.thinkingLevel);

	const { data: allSessionsData = [] } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.orderBy(({ chatSessions }) => chatSessions.lastActiveAt, "desc")
				.select(({ chatSessions }) => ({ ...chatSessions })),
		[collections.chatSessions],
	);

	const sessions = useMemo(() => {
		const scopedOrUnscoped = allSessionsData.filter(
			(item) => item.workspaceId === workspaceId || item.workspaceId === null,
		);
		return scopedOrUnscoped.length > 0 ? scopedOrUnscoped : allSessionsData;
	}, [allSessionsData, workspaceId]);

	useEffect(() => {
		if (sessionId && sessions.some((item) => item.id === sessionId)) return;
		setSessionId(sessions[0]?.id ?? null);
	}, [sessionId, sessions]);

	const sessionItems = useMemo(
		() => sessions.map((item) => toSessionSelectorItem(item)),
		[sessions],
	);

	const [availableModels, setAvailableModels] = useState<
		Array<{ id: string; name: string; provider: string }>
	>([]);

	useEffect(() => {
		void apiTrpcClient.chat.getModels.query().then((result) => {
			setAvailableModels(result.models);
		});
	}, []);

	const selectedModel =
		availableModels.find((model) => model.id === selectedModelId) ??
		availableModels[0] ??
		null;

	const queryInput =
		sessionId === null
			? undefined
			: {
					sessionId,
					workspaceId,
				};

	const displayStateQuery = workspaceTrpc.chat.getDisplayState.useQuery(
		queryInput as { sessionId: string; workspaceId: string },
		{
			enabled: queryInput !== undefined,
			refetchInterval: (query) =>
				query.state.data && "isRunning" in query.state.data
					? ((query.state.data as WorkspaceChatDisplayState).isRunning
							? 1000
							: 3000)
					: 3000,
		},
	);

	const messagesQuery = workspaceTrpc.chat.listMessages.useQuery(
		queryInput as { sessionId: string; workspaceId: string },
		{
			enabled: queryInput !== undefined,
			refetchInterval: 1500,
		},
	);

	const utils = workspaceTrpc.useUtils();

	const refreshSession = useCallback(async () => {
		if (!queryInput) return;
		await Promise.all([
			utils.chat.getDisplayState.invalidate(queryInput),
			utils.chat.listMessages.invalidate(queryInput),
		]);
	}, [queryInput, utils.chat.getDisplayState, utils.chat.listMessages]);

	const sendMessageMutation = workspaceTrpc.chat.sendMessage.useMutation({
		onSuccess: () => {
			void refreshSession();
		},
	});
	const restartMutation = workspaceTrpc.chat.restartFromMessage.useMutation({
		onSuccess: () => {
			void refreshSession();
		},
	});
	const stopMutation = workspaceTrpc.chat.stop.useMutation({
		onSuccess: () => {
			void refreshSession();
		},
	});
	const respondToApprovalMutation =
		workspaceTrpc.chat.respondToApproval.useMutation({
			onSuccess: () => {
				void refreshSession();
			},
		});
	const respondToQuestionMutation =
		workspaceTrpc.chat.respondToQuestion.useMutation({
			onSuccess: () => {
				void refreshSession();
			},
		});
	const respondToPlanMutation = workspaceTrpc.chat.respondToPlan.useMutation({
		onSuccess: () => {
			void refreshSession();
		},
	});

	const handleNewChat = useCallback(async () => {
		if (!organizationId) {
			throw new Error("No active organization selected");
		}

		setIsSessionInitializing(true);
		try {
			const nextSessionId = crypto.randomUUID();
			await createSessionRecord({
				sessionId: nextSessionId,
				organizationId,
				workspaceId,
			});
			setSessionId(nextSessionId);
		} finally {
			setIsSessionInitializing(false);
		}
	}, [organizationId, workspaceId]);

	useEffect(() => {
		if (sessionId || sessions.length > 0 || !organizationId || isSessionInitializing) {
			return;
		}

		void handleNewChat().catch(() => {});
	}, [
		handleNewChat,
		isSessionInitializing,
		organizationId,
		sessionId,
		sessions.length,
	]);

	const handleDeleteSession = useCallback(
		async (sessionIdToDelete: string) => {
			await deleteSessionRecord(sessionIdToDelete);
			if (sessionIdToDelete === sessionId) {
				setSessionId(null);
			}
		},
		[sessionId],
	);

	const handleSendMessage = useCallback(
		async (content: string) => {
			const trimmed = content.trim();
			if (!trimmed) return;

			let targetSessionId = sessionId;
			if (!targetSessionId) {
				if (!organizationId) {
					throw new Error("No active organization selected");
				}

				targetSessionId = crypto.randomUUID();
				setIsSessionInitializing(true);
				try {
					await createSessionRecord({
						sessionId: targetSessionId,
						organizationId,
						workspaceId,
					});
					setSessionId(targetSessionId);
				} finally {
					setIsSessionInitializing(false);
				}
			}

			await sendMessageMutation.mutateAsync({
				sessionId: targetSessionId,
				workspaceId,
				payload: { content: trimmed },
				metadata: {
					model: selectedModel?.id,
					thinkingLevel,
				},
			});
		},
		[
			organizationId,
			selectedModel?.id,
			sendMessageMutation,
			sessionId,
			thinkingLevel,
			workspaceId,
		],
	);

	return {
		organizationId,
		sessionId,
		setSessionId,
		sessionItems,
		isSessionInitializing,
		displayState: displayStateQuery.data ?? null,
		messages: (messagesQuery.data as WorkspaceChatMessage[] | undefined) ?? [],
		isConversationLoading:
			(queryInput !== undefined &&
				(displayStateQuery.isPending || messagesQuery.isPending)) ??
			false,
		errorMessage:
			displayStateQuery.data?.errorMessage ??
			displayStateQuery.error?.message ??
			messagesQuery.error?.message ??
			null,
		availableModels,
		selectedModel,
		setSelectedModelId,
		isRunning: displayStateQuery.data?.isRunning ?? false,
		isSubmitting:
			sendMessageMutation.isPending ||
			restartMutation.isPending ||
			stopMutation.isPending,
		handleNewChat,
		handleDeleteSession,
		handleSendMessage,
		handleStop: async () => {
			if (!sessionId) return;
			await stopMutation.mutateAsync({ sessionId, workspaceId });
		},
		handleApprovalResponse: async (
			decision: "approve" | "decline" | "always_allow_category",
		) => {
			if (!sessionId) return;
			await respondToApprovalMutation.mutateAsync({
				sessionId,
				workspaceId,
				payload: { decision },
			});
		},
		handleQuestionResponse: async (questionId: string, answer: string) => {
			if (!sessionId) return;
			await respondToQuestionMutation.mutateAsync({
				sessionId,
				workspaceId,
				payload: { questionId, answer },
			});
		},
		handlePlanResponse: async (response: {
			action: "approved" | "rejected";
			feedback?: string;
		}) => {
			if (!sessionId) return;
			const pendingPlan = displayStateQuery.data?.pendingPlanApproval;
			if (!pendingPlan?.planId) return;
			await respondToPlanMutation.mutateAsync({
				sessionId,
				workspaceId,
				payload: {
					planId: pendingPlan.planId,
					response,
				},
			});
		},
	};
}
