import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StartFreshSessionResult } from "renderer/components/Chat/ChatInterface/types";
import { env } from "renderer/env.renderer";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import { posthog } from "renderer/lib/posthog";
import { workspaceTrpc } from "renderer/lib/workspace-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

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
	const legacySessionBootstrapRef = useRef(false);

	const { data: workspace } = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{ enabled: Boolean(workspaceId) },
	);

	const { data: allSessionsData } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.orderBy(({ chatSessions }) => chatSessions.lastActiveAt, "desc")
				.select(({ chatSessions }) => ({ ...chatSessions })),
		[collections.chatSessions],
	);
	const allSessions = allSessionsData ?? [];
	const sessions = useMemo(() => {
		const scopedOrUnscoped = allSessions.filter(
			(item) => item.workspaceId === workspaceId || item.workspaceId === null,
		);
		return scopedOrUnscoped.length > 0 ? scopedOrUnscoped : allSessions;
	}, [allSessions, workspaceId]);

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
			targetOrganizationId,
			newSessionId,
		}: {
			targetOrganizationId: string;
			newSessionId: string;
		}): Promise<StartFreshSessionResult> => {
			try {
				await createSessionRecord({
					sessionId: newSessionId,
					organizationId: targetOrganizationId,
					workspaceId,
				});
				setSessionId(newSessionId);
				posthog.capture("chat_session_created", {
					workspace_id: workspaceId,
					session_id: newSessionId,
					organization_id: targetOrganizationId,
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
		[workspaceId],
	);

	const handleNewChat = useCallback(async () => {
		if (!organizationId) return;
		const createResult = await createAndActivateSession({
			targetOrganizationId: organizationId,
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
			targetOrganizationId: organizationId,
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
				organizationId,
				workspaceId,
			});
			return true;
		} catch {
			return false;
		} finally {
			setIsSessionInitializing(false);
		}
	}, [hasCurrentSessionRecord, organizationId, sessionId, workspaceId]);

	useEffect(() => {
		if (sessionId || sessions.length > 0 || !organizationId) return;
		if (legacySessionBootstrapRef.current) return;
		legacySessionBootstrapRef.current = true;

		void handleNewChat()
			.catch(() => {})
			.finally(() => {
				legacySessionBootstrapRef.current = false;
			});
	}, [handleNewChat, organizationId, sessionId, sessions.length]);

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
