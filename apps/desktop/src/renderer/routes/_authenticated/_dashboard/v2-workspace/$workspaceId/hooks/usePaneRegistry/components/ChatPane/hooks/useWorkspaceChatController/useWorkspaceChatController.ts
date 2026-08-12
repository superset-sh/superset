import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	isDesktopChatDevMode,
	resolveDesktopChatOrganizationId,
} from "renderer/lib/dev-chat";
import { posthog } from "renderer/lib/posthog";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";

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
	const endSessionMutation = workspaceTrpc.chat.endSession.useMutation();
	const { chatSessions: chatSessionActions } = useOptimisticActions();
	const utils = cloudTrpc.useUtils();

	const { data: workspace } = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{ enabled: Boolean(workspaceId) },
	);

	// Already ordered by lastActiveAt desc server-side.
	const { data: allSessions = [] } =
		cloudTrpc.chat.listSessions.useQuery(undefined);
	const sessions = useMemo(
		() =>
			allSessions.filter((session) => session.v2WorkspaceId === workspaceId),
		[allSessions, workspaceId],
	);

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
			// Tear down the host-service in-memory runtime so it doesn't leak.
			// Failures here must not block the user-visible delete.
			void endSessionMutation
				.mutateAsync({ sessionId: sessionIdToDelete, workspaceId })
				.catch(() => {});

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
			endSessionMutation,
			onSessionIdChange,
			organizationId,
			sessionId,
			workspaceId,
		],
	);

	// The selector reads from `chat.listSessions`, so a freshly created session
	// stays invisible (and is re-created on every send) until that cache is
	// refreshed.
	const createAndSyncSession = useCallback(
		async (nextSessionId: string): Promise<void> => {
			await createSessionRecord({
				sessionId: nextSessionId,
				v2WorkspaceId: workspaceId,
			});
			await utils.chat.listSessions.invalidate();
		},
		[utils, workspaceId],
	);

	const getOrCreateSession = useCallback(async (): Promise<string> => {
		if (!organizationId) {
			throw new Error("No active organization selected");
		}

		if (sessionId) {
			if (sessions.some((item) => item.id === sessionId)) {
				return sessionId;
			}

			await createAndSyncSession(sessionId);
			return sessionId;
		}

		const nextSessionId = crypto.randomUUID();
		await createAndSyncSession(nextSessionId);
		onSessionIdChange(nextSessionId);
		posthog.capture("chat_session_created", {
			workspace_id: workspaceId,
			session_id: nextSessionId,
			organization_id: organizationId,
		});
		return nextSessionId;
	}, [
		createAndSyncSession,
		onSessionIdChange,
		organizationId,
		sessionId,
		sessions,
		workspaceId,
	]);

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
