import { ChatServiceProvider } from "@superset/chat/client";
import { ChatMastraServiceProvider } from "@superset/chat-mastra/client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useTabsStore } from "renderer/stores/tabs/store";
import { createChatServiceIpcClient } from "../ChatPane/utils/chat-service-client";
import { BasePaneWindow, PaneToolbarActions } from "../components";
import { ChatMastraInterface } from "./ChatMastraInterface";
import { SessionSelector } from "./components/SessionSelector";
import { createChatMastraServiceIpcClient } from "./utils/chat-mastra-service-client";

const mastraIpcClient = createChatMastraServiceIpcClient();
const legacyChatIpcClient = createChatServiceIpcClient();

interface ChatMastraPaneProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
	workspaceId: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
}

function toSessionSelectorItem(session: {
	sessionId: string;
	title: string;
	updatedAt: Date | string;
}) {
	return {
		sessionId: session.sessionId,
		title: session.title,
		updatedAt:
			session.updatedAt instanceof Date
				? session.updatedAt
				: new Date(session.updatedAt),
	};
}

export function ChatMastraPane({
	paneId,
	path,
	tabId,
	workspaceId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: ChatMastraPaneProps) {
	const pane = useTabsStore((state) => state.panes[paneId]);
	const switchChatMastraSession = useTabsStore(
		(state) => state.switchChatMastraSession,
	);
	const sessionId = pane?.chatMastra?.sessionId ?? null;
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const ensureSessionRef = useRef(false);

	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: Boolean(workspaceId) },
	);

	const { data: sessions = [] } =
		electronTrpc.chatMastraService.session.list.useQuery(
			{ workspaceId },
			{ enabled: Boolean(workspaceId) },
		);

	const createSessionMutation =
		electronTrpc.chatMastraService.session.create.useMutation();
	const deleteSessionMutation =
		electronTrpc.chatMastraService.session.delete.useMutation();

	const handleSelectSession = useCallback(
		(nextSessionId: string) => {
			switchChatMastraSession(paneId, nextSessionId);
		},
		[paneId, switchChatMastraSession],
	);

	const handleNewChat = useCallback(async () => {
		const created = await createSessionMutation.mutateAsync({ workspaceId });
		switchChatMastraSession(paneId, created.sessionId);
	}, [createSessionMutation, paneId, switchChatMastraSession, workspaceId]);

	const handleDeleteSession = useCallback(
		async (sessionIdToDelete: string) => {
			await deleteSessionMutation.mutateAsync({ sessionId: sessionIdToDelete });
			if (sessionIdToDelete === sessionId) {
				switchChatMastraSession(paneId, null);
			}
		},
		[deleteSessionMutation, paneId, sessionId, switchChatMastraSession],
	);

	const handleStartFreshSession = useCallback(async () => {
		try {
			const created = await createSessionMutation.mutateAsync({ workspaceId });
			switchChatMastraSession(paneId, created.sessionId);
			return { created: true as const };
		} catch (error) {
			return {
				created: false as const,
				errorMessage:
					error instanceof Error
						? error.message
						: "Failed to create a new chat session",
			};
		}
	}, [createSessionMutation, paneId, switchChatMastraSession, workspaceId]);

	useEffect(() => {
		if (sessionId) return;
		if (sessions.length > 0) {
			switchChatMastraSession(paneId, sessions[0].sessionId);
			return;
		}
		if (ensureSessionRef.current) return;
		ensureSessionRef.current = true;

		void createSessionMutation
			.mutateAsync({ workspaceId })
			.then((created) => {
				switchChatMastraSession(paneId, created.sessionId);
			})
			.finally(() => {
				ensureSessionRef.current = false;
			});
	}, [
		createSessionMutation,
		paneId,
		sessionId,
		sessions,
		switchChatMastraSession,
		workspaceId,
	]);

	const sessionItems = useMemo(
		() => sessions.map((item) => toSessionSelectorItem(item)),
		[sessions],
	);

	return (
		<ChatMastraServiceProvider
			client={mastraIpcClient}
			queryClient={electronQueryClient}
		>
			<ChatServiceProvider
				client={legacyChatIpcClient}
				queryClient={electronQueryClient}
			>
				<BasePaneWindow
					paneId={paneId}
					path={path}
					tabId={tabId}
					splitPaneAuto={splitPaneAuto}
					removePane={removePane}
					setFocusedPane={setFocusedPane}
					renderToolbar={(handlers) => (
						<div className="flex h-full w-full items-center justify-between px-3">
							<div className="flex min-w-0 items-center gap-2">
								<SessionSelector
									currentSessionId={sessionId}
									sessions={sessionItems}
									onSelectSession={handleSelectSession}
									onNewChat={handleNewChat}
									onDeleteSession={handleDeleteSession}
								/>
							</div>
							<PaneToolbarActions
								splitOrientation={handlers.splitOrientation}
								onSplitPane={handlers.onSplitPane}
								onClosePane={handlers.onClosePane}
								closeHotkeyId="CLOSE_TERMINAL"
							/>
						</div>
					)}
				>
					<ChatMastraInterface
						sessionId={sessionId}
						organizationId={organizationId}
						workspaceId={workspaceId}
						cwd={workspace?.worktreePath ?? ""}
						onStartFreshSession={handleStartFreshSession}
					/>
				</BasePaneWindow>
			</ChatServiceProvider>
		</ChatMastraServiceProvider>
	);
}
