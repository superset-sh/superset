import {
	ChatRuntimeServiceProvider,
	ChatServiceProvider,
} from "@superset/chat/client";
import { isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import {
	createFileRoute,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createChatServiceIpcClient } from "renderer/components/Chat/utils/chat-service-client";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import {
	isDesktopChatDevMode,
	resolveDesktopChatOrganizationId,
} from "renderer/lib/dev-chat";
import { posthog } from "renderer/lib/posthog";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { ChatPaneInterface } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatPaneInterface";
import { createChatRuntimeServiceIpcClient } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/utils/chat-runtime-service-client";
import type { ChatLaunchConfig } from "shared/tabs-types";

interface ChatSearch {
	chatSessionId?: string;
}

function parseNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function fallbackTitleFromSubmittedMessage(message: string): string {
	const normalized = message
		.replace(/\s+/g, " ")
		.replace(/[。！？!?.,，、；;：:]+$/g, "")
		.trim();
	if (!normalized) return "New Chat";
	return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
}

function isPlaceholderChatTitle(title: string | null | undefined): boolean {
	const normalized = title?.trim();
	return !normalized || normalized.toLowerCase() === "new chat";
}

export const Route = createFileRoute("/_authenticated/_dashboard/chat/")({
	component: ChatHomePage,
	validateSearch: (raw: Record<string, unknown>): ChatSearch => ({
		chatSessionId: parseNonEmptyString(raw.chatSessionId),
	}),
});

const chatRuntimeIpcClient = createChatRuntimeServiceIpcClient();
const chatIpcClient = createChatServiceIpcClient();

function useStandaloneChatController({
	sessionId,
	onSessionIdChange,
}: {
	sessionId: string | null;
	onSessionIdChange: (sessionId: string | null) => void;
}) {
	const { data: authSession } = authClient.useSession();
	const organizationId = resolveDesktopChatOrganizationId(
		authSession?.session?.activeOrganizationId,
	);
	const userId = authSession?.user?.id;
	const collections = useCollections();
	const { chatSessions: chatSessionActions } = useOptimisticCollectionActions();
	const [locallyReadySessionIds, setLocallyReadySessionIds] = useState<
		ReadonlySet<string>
	>(() => new Set());

	const { data: allRows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ chatSessions: collections.chatSessions })
				.where(({ chatSessions }) => isNull(chatSessions.workspaceId))
				.orderBy(({ chatSessions }) => chatSessions.lastActiveAt, "desc")
				.select(({ chatSessions }) => ({
					id: chatSessions.id,
					title: chatSessions.title,
					v2WorkspaceId: chatSessions.v2WorkspaceId,
				})),
		[collections.chatSessions],
	);

	const sessions = useMemo(
		() => allRows.filter((row) => row.v2WorkspaceId === null),
		[allRows],
	);
	const hasPersistedSession = Boolean(
		sessionId &&
			(sessions.some((row) => row.id === sessionId) ||
				locallyReadySessionIds.has(sessionId)),
	);
	const hasCurrentSessionRecord = hasPersistedSession;

	const createAndActivateSession = useCallback(
		async (nextSessionId: string, options?: { activate?: boolean }) => {
			if (!organizationId) {
				throw new Error("No active organization selected");
			}
			if (!userId) {
				throw new Error("No active user selected");
			}
			const transaction = chatSessionActions.createSession({
				sessionId: nextSessionId,
				organizationId,
				userId,
			});
			if (transaction) {
				await transaction.isPersisted.promise;
			} else {
				await apiTrpcClient.chat.createSession.mutate({
					sessionId: nextSessionId,
					v2WorkspaceId: null,
				});
			}
			setLocallyReadySessionIds((previous) => {
				if (previous.has(nextSessionId)) return previous;
				const next = new Set(previous);
				next.add(nextSessionId);
				return next;
			});
			if (options?.activate !== false) {
				onSessionIdChange(nextSessionId);
			}
			posthog.capture("chat_session_created", {
				workspace_id: null,
				session_id: nextSessionId,
				organization_id: organizationId,
			});
			return nextSessionId;
		},
		[chatSessionActions, onSessionIdChange, organizationId, userId],
	);

	const ensureSessionReady = useCallback(async (): Promise<boolean> => {
		if (!sessionId) return false;
		if (hasCurrentSessionRecord) return true;
		try {
			await createAndActivateSession(sessionId);
			return true;
		} catch (error) {
			console.error("[standalone-chat] failed to ensure session", error);
			return false;
		}
	}, [createAndActivateSession, hasCurrentSessionRecord, sessionId]);

	const startFreshSession = useCallback(async () => {
		if (!organizationId) {
			return {
				created: false,
				errorMessage: "No active organization selected",
			};
		}
		try {
			const nextSessionId = await createAndActivateSession(
				crypto.randomUUID(),
				{
					activate: false,
				},
			);
			return { created: true, sessionId: nextSessionId };
		} catch (error) {
			return {
				created: false,
				errorMessage:
					error instanceof Error
						? error.message
						: "Failed to create a new chat session",
			};
		}
	}, [createAndActivateSession, organizationId]);

	const applySubmittedMessageFallbackTitle = useCallback(
		(message: string, targetSessionId: string | null) => {
			if (!targetSessionId) return;
			const session = sessions.find((row) => row.id === targetSessionId);
			if (session && !isPlaceholderChatTitle(session.title)) return;
			const title = fallbackTitleFromSubmittedMessage(message);
			if (isPlaceholderChatTitle(title)) return;
			const transaction = chatSessionActions.updateTitle(
				targetSessionId,
				title,
			);
			void transaction?.isPersisted.promise.catch(() => {});
		},
		[chatSessionActions, sessions],
	);

	useEffect(() => {
		if (!sessionId) return;
		if (sessions.some((row) => row.id === sessionId)) return;
		if (!isDesktopChatDevMode()) return;
		void createAndActivateSession(sessionId).catch(() => {});
	}, [createAndActivateSession, sessionId, sessions]);

	return {
		organizationId,
		hasCurrentSessionRecord,
		ensureSessionReady,
		startFreshSession,
		applySubmittedMessageFallbackTitle,
	};
}

function ChatHomePage() {
	const navigate = useNavigate();
	const location = useLocation();
	const chatSessionId = parseNonEmptyString(
		(location.search as Record<string, unknown>).chatSessionId,
	);
	const sessionId = chatSessionId ?? null;

	const handleSessionIdChange = useCallback(
		(nextSessionId: string | null) => {
			void navigate({
				to: "/chat",
				search: nextSessionId ? { chatSessionId: nextSessionId } : {},
				replace: true,
			});
		},
		[navigate],
	);

	const {
		organizationId,
		hasCurrentSessionRecord,
		ensureSessionReady,
		startFreshSession,
		applySubmittedMessageFallbackTitle,
	} = useStandaloneChatController({
		sessionId,
		onSessionIdChange: handleSessionIdChange,
	});

	const emptyLaunchConfig = null satisfies ChatLaunchConfig | null;

	return (
		<ChatRuntimeServiceProvider
			client={chatRuntimeIpcClient}
			queryClient={electronQueryClient}
		>
			<ChatServiceProvider
				client={chatIpcClient}
				queryClient={electronQueryClient}
			>
				<div
					className="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden bg-background"
					data-dashboard-mode="chat"
				>
					<div className="relative min-h-0 flex-1 overflow-hidden">
						<div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-background via-background/80 to-transparent" />
						<ChatPaneInterface
							sessionId={sessionId}
							initialLaunchConfig={emptyLaunchConfig}
							workspaceId={null}
							organizationId={organizationId}
							cwd=""
							isFocused
							isSessionReady={hasCurrentSessionRecord}
							ensureSessionReady={ensureSessionReady}
							onStartFreshSession={startFreshSession}
							onConsumeLaunchConfig={() => {}}
							onSessionReady={handleSessionIdChange}
							onUserMessageSubmitted={applySubmittedMessageFallbackTitle}
							placeholder="Ask anything"
							messageListTopInset="standalone"
						/>
					</div>
				</div>
			</ChatServiceProvider>
		</ChatRuntimeServiceProvider>
	);
}
