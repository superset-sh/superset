import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import {
	isDesktopChatDevMode,
	resolveDesktopChatOrganizationId,
} from "renderer/lib/dev-chat";
import { posthog } from "renderer/lib/posthog";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

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

async function createSessionRecord(input: {
	sessionId: string;
	v2WorkspaceId: string;
}): Promise<void> {
	if (isDesktopChatDevMode()) return;
	await apiTrpcClient.chat.createSession.mutate({
		sessionId: input.sessionId,
		v2WorkspaceId: input.v2WorkspaceId,
	});
}

export function useWorkspaceChatController({
	sessionId,
	onSessionIdChange,
	workspaceId,
}: {
	sessionId: string | null;
	onSessionIdChange: (sessionId: string | null) => void;
	workspaceId: string;
}) {
	const { data: session } = authClient.useSession();
	const organizationId = resolveDesktopChatOrganizationId(
		session?.session?.activeOrganizationId,
	);
	const collections = useCollections();
	const { chatSessions: chatSessionActions } = useOptimisticCollectionActions();

	const { data: workspace } = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{ enabled: Boolean(workspaceId) },
	);

	const { data: allSessionsData } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.where(({ chatSessions }) =>
					eq(chatSessions.v2WorkspaceId, workspaceId),
				)
				.orderBy(({ chatSessions }) => chatSessions.lastActiveAt, "desc")
				.select(({ chatSessions }) => ({ ...chatSessions })),
		[collections.chatSessions, workspaceId],
	);
	const sessions = allSessionsData ?? [];

	const handleSelectSession = useCallback(
		(nextSessionId: string) => {
			onSessionIdChange(nextSessionId);
		},
		[onSessionIdChange],
	);

	const handleNewChat = useCallback(async () => {
		onSessionIdChange(null);
	}, [onSessionIdChange]);

	const handleDeleteSession = useCallback(
		async (sessionIdToDelete: string) => {
			const transaction = chatSessionActions.deleteSession(sessionIdToDelete);
			if (!transaction && !isDesktopChatDevMode()) {
				throw new Error("Failed to delete chat session");
			}

			posthog.capture("chat_session_deleted", {
				workspace_id: workspaceId,
				session_id: sessionIdToDelete,
				organization_id: organizationId,
			});
			if (sessionIdToDelete === sessionId) {
				onSessionIdChange(null);
			}
		},
		[
			chatSessionActions,
			onSessionIdChange,
			organizationId,
			sessionId,
			workspaceId,
		],
	);

	const getOrCreateSession = useCallback(async (): Promise<string> => {
		if (!organizationId) {
			throw new Error("No active organization selected");
		}

		if (sessionId) {
			if (sessions.some((item) => item.id === sessionId)) {
				return sessionId;
			}

			await createSessionRecord({
				sessionId,
				v2WorkspaceId: workspaceId,
			});
			return sessionId;
		}

		const nextSessionId = crypto.randomUUID();
		await createSessionRecord({
			sessionId: nextSessionId,
			v2WorkspaceId: workspaceId,
		});
		onSessionIdChange(nextSessionId);
		posthog.capture("chat_session_created", {
			workspace_id: workspaceId,
			session_id: nextSessionId,
			organization_id: organizationId,
		});
		return nextSessionId;
	}, [onSessionIdChange, organizationId, sessionId, sessions, workspaceId]);

	const sessionItems = useMemo(() => {
		const nextItems = sessions.map((item) => toSessionSelectorItem(item));
		if (
			!isDesktopChatDevMode() ||
			!sessionId ||
			nextItems.some((item) => item.sessionId === sessionId)
		) {
			return nextItems;
		}
		return [
			{
				sessionId,
				title: "",
				updatedAt: new Date(),
			},
			...nextItems,
		];
	}, [sessionId, sessions]);

	return {
		sessionId,
		organizationId,
		workspacePath: workspace?.worktreePath ?? "",
		sessionItems,
		handleSelectSession,
		handleNewChat,
		handleDeleteSession,
		getOrCreateSession,
	};
}
