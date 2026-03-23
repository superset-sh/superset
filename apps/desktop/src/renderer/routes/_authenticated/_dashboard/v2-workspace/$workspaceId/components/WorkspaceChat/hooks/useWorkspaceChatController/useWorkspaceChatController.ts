import { toast } from "@superset/ui/sonner";
import { eq } from "@tanstack/db";
import { workspaceTrpc } from "@superset/workspace-client";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StartFreshSessionResult } from "renderer/components/Chat/ChatInterface/types";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { posthog } from "renderer/lib/posthog";
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
	await apiTrpcClient.chat.createSession.mutate({
		sessionId: input.sessionId,
		v2WorkspaceId: input.v2WorkspaceId,
	});
}

async function deleteSessionRecord(sessionId: string): Promise<void> {
	const result = await apiTrpcClient.chat.deleteSession.mutate({
		sessionId,
	});
	if (!result.deleted) {
		throw new Error(`Failed to delete session ${sessionId}`);
	}
}

export function useWorkspaceChatController({
	workspaceId,
}: {
	workspaceId: string;
}) {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const collections = useCollections();
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [isSessionInitializing, setIsSessionInitializing] = useState(false);

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

	useEffect(() => {
		if (sessionId && sessions.some((item) => item.id === sessionId)) return;
		setSessionId(sessions[0]?.id ?? null);
	}, [sessionId, sessions]);

	const hasCurrentSessionRecord = Boolean(
		sessionId && sessions.some((item) => item.id === sessionId),
	);

	const handleSelectSession = useCallback((nextSessionId: string) => {
		setSessionId(nextSessionId);
	}, []);

	const createAndActivateSession = useCallback(
		async ({
			newSessionId,
		}: {
			newSessionId: string;
		}): Promise<StartFreshSessionResult> => {
			try {
				await createSessionRecord({
					sessionId: newSessionId,
					v2WorkspaceId: workspaceId,
				});
				setSessionId(newSessionId);
				posthog.capture("chat_session_created", {
					workspace_id: workspaceId,
					session_id: newSessionId,
					organization_id: organizationId,
				});
				return { created: true, sessionId: newSessionId };
			} catch (error) {
				return {
					created: false,
					errorMessage:
						error instanceof Error
							? error.message
							: "Failed to create a new chat session",
				};
			}
		},
		[organizationId, workspaceId],
	);

	const handleNewChat = useCallback(async () => {
		if (!organizationId) return;
		const createResult = await createAndActivateSession({
			newSessionId: crypto.randomUUID(),
		});
		if (!createResult.created) {
			toast.error("Failed to create session");
		}
	}, [createAndActivateSession, organizationId]);

	const handleStartFreshSession = useCallback(async () => {
		if (!organizationId) {
			return {
				created: false,
				errorMessage: "No active organization selected",
			};
		}

		return createAndActivateSession({
			newSessionId: crypto.randomUUID(),
		});
	}, [createAndActivateSession, organizationId]);

	const handleDeleteSession = useCallback(
		async (sessionIdToDelete: string) => {
			await deleteSessionRecord(sessionIdToDelete);
			posthog.capture("chat_session_deleted", {
				workspace_id: workspaceId,
				session_id: sessionIdToDelete,
				organization_id: organizationId,
			});
			if (sessionIdToDelete === sessionId) {
				setSessionId(null);
			}
		},
		[organizationId, sessionId, workspaceId],
	);

	const ensureCurrentSessionRecord = useCallback(async (): Promise<boolean> => {
		if (hasCurrentSessionRecord) return true;
		if (!sessionId || !organizationId) return false;
		try {
			setIsSessionInitializing(true);
			await createSessionRecord({
				sessionId,
				v2WorkspaceId: workspaceId,
			});
			return true;
		} catch {
			return false;
		} finally {
			setIsSessionInitializing(false);
		}
	}, [hasCurrentSessionRecord, organizationId, sessionId, workspaceId]);

	const sessionItems = useMemo(
		() => sessions.map((item) => toSessionSelectorItem(item)),
		[sessions],
	);

	return {
		sessionId,
		launchConfig: null,
		organizationId,
		workspacePath: workspace?.worktreePath ?? "",
		isSessionInitializing,
		hasCurrentSessionRecord,
		sessionItems,
		handleSelectSession,
		handleNewChat,
		handleStartFreshSession,
		handleDeleteSession,
		ensureCurrentSessionRecord,
		consumeLaunchConfig: () => {},
	};
}
