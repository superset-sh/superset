import { toast } from "@superset/ui/sonner";
import { useCallback, useMemo } from "react";
import type { StartFreshSessionResult } from "renderer/components/Chat/ChatInterface/types";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	isDesktopChatDevMode,
	resolveDesktopChatOrganizationId,
} from "renderer/lib/dev-chat";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChatLaunchConfig } from "shared/tabs-types";
import { reportChatError } from "../../utils/reportChatError";

interface SessionSelectorItem {
	sessionId: string;
	title: string;
	updatedAt: Date;
}

interface UseChatPaneControllerOptions {
	paneId: string;
	workspaceId: string;
}

interface UseChatPaneControllerReturn {
	sessionId: string | null;
	launchConfig: ChatLaunchConfig | null;
	organizationId: string | null;
	workspacePath: string;
	isSessionInitializing: boolean;
	hasCurrentSessionRecord: boolean;
	sessionItems: SessionSelectorItem[];
	handleSelectSession: (sessionId: string) => void;
	handleNewChat: () => Promise<void>;
	handleStartFreshSession: () => Promise<StartFreshSessionResult>;
	handleDeleteSession: (sessionId: string) => Promise<void>;
	ensureCurrentSessionRecord: () => Promise<boolean>;
	consumeLaunchConfig: () => void;
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

export function useChatPaneController({
	paneId,
	workspaceId,
}: UseChatPaneControllerOptions): UseChatPaneControllerReturn {
	const pane = useTabsStore((state) => state.panes[paneId]);
	const switchChatSession = useTabsStore((state) => state.switchChatSession);
	const setChatLaunchConfig = useTabsStore(
		(state) => state.setChatLaunchConfig,
	);
	const sessionId = pane?.chat?.sessionId ?? null;
	const launchConfig = pane?.chat?.launchConfig ?? null;
	const { data: session } = authClient.useSession();
	const organizationId = resolveDesktopChatOrganizationId(
		session?.session?.activeOrganizationId,
	);

	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: Boolean(workspaceId) },
	);

	const utils = cloudTrpc.useUtils();

	// Already ordered by lastActiveAt desc server-side.
	const { data: allSessions = [] } =
		cloudTrpc.chat.listSessions.useQuery(undefined);
	const sessions = useMemo(() => {
		const scopedOrUnscoped = allSessions.filter(
			(item) => item.workspaceId === workspaceId || item.workspaceId === null,
		);
		return scopedOrUnscoped.length > 0 ? scopedOrUnscoped : allSessions;
	}, [allSessions, workspaceId]);

	const handleSelectSession = useCallback(
		(nextSessionId: string) => {
			switchChatSession(paneId, nextSessionId);
			posthog.capture("chat_session_opened", {
				workspace_id: workspaceId,
				session_id: nextSessionId,
				organization_id: organizationId,
			});
		},
		[organizationId, paneId, switchChatSession, workspaceId],
	);

	const createAndActivateSession = useCallback(
		({
			targetOrganizationId,
			newSessionId,
		}: {
			targetOrganizationId: string;
			newSessionId: string;
		}): StartFreshSessionResult => {
			switchChatSession(paneId, newSessionId);
			posthog.capture("chat_session_created", {
				workspace_id: workspaceId,
				session_id: newSessionId,
				organization_id: targetOrganizationId,
			});
			return { created: true, sessionId: newSessionId };
		},
		[paneId, switchChatSession, workspaceId],
	);

	const handleNewChat = useCallback(async () => {
		if (!organizationId) return;
		createAndActivateSession({
			targetOrganizationId: organizationId,
			newSessionId: crypto.randomUUID(),
		});
	}, [createAndActivateSession, organizationId]);

	const handleStartFreshSession =
		useCallback(async (): Promise<StartFreshSessionResult> => {
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
			try {
				await apiTrpcClient.chat.deleteSession.mutate({
					sessionId: sessionIdToDelete,
				});
				void utils.chat.listSessions.invalidate();
				posthog.capture("chat_session_deleted", {
					workspace_id: workspaceId,
					session_id: sessionIdToDelete,
					organization_id: organizationId,
				});
				if (sessionIdToDelete === sessionId) {
					switchChatSession(paneId, null);
				}
			} catch (error) {
				reportChatError({
					operation: "session.delete",
					error,
					sessionId: sessionIdToDelete,
					workspaceId,
					paneId,
					organizationId,
				});
				toast.error("Failed to delete session");
				throw error;
			}
		},
		[organizationId, paneId, sessionId, switchChatSession, utils, workspaceId],
	);

	const ensureCurrentSessionRecord = useCallback(async (): Promise<boolean> => {
		return Boolean(sessionId);
	}, [sessionId]);

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

	const consumeLaunchConfig = useCallback(() => {
		setChatLaunchConfig(paneId, null);
	}, [paneId, setChatLaunchConfig]);

	return {
		sessionId,
		launchConfig,
		organizationId,
		workspacePath: workspace?.worktreePath ?? "",
		isSessionInitializing: false,
		hasCurrentSessionRecord: Boolean(sessionId),
		sessionItems,
		handleSelectSession,
		handleNewChat,
		handleStartFreshSession,
		handleDeleteSession,
		ensureCurrentSessionRecord,
		consumeLaunchConfig,
	};
}
