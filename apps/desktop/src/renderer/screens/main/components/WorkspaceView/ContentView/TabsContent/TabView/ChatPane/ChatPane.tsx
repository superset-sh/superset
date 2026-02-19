import { useCallback } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { env } from "renderer/env.renderer";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { BasePaneWindow, PaneToolbarActions } from "../components";
import { ChatInterface } from "./ChatInterface";
import { SessionSelector } from "./components/SessionSelector";

const apiUrl = env.NEXT_PUBLIC_API_URL;

interface ChatPaneProps {
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

export function ChatPane({
	paneId,
	path,
	tabId,
	workspaceId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: ChatPaneProps) {
	const pane = useTabsStore((s) => s.panes[paneId]);
	const switchChatSession = useTabsStore((s) => s.switchChatSession);
	const sessionId = pane?.chat?.sessionId ?? null;

	const { data: session } = authClient.useSession();
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();

	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);

	const organizationId = session?.session?.activeOrganizationId ?? null;
	const deviceId = deviceInfo?.deviceId ?? null;

	const handleSelectSession = useCallback(
		(newSessionId: string) => {
			switchChatSession(paneId, newSessionId);
		},
		[paneId, switchChatSession],
	);

	const handleNewChat = useCallback(() => {
		switchChatSession(paneId, null);
	}, [paneId, switchChatSession]);

	const handleDeleteSession = useCallback(
		(sessionIdToDelete: string) => {
			const token = getAuthToken();
			fetch(`${apiUrl}/api/chat/${sessionIdToDelete}/stream`, {
				method: "DELETE",
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			}).catch(console.error);

			if (sessionIdToDelete === sessionId) {
				switchChatSession(paneId, null);
			}
		},
		[sessionId, paneId, switchChatSession],
	);

	return (
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
			<ChatInterface
				sessionId={sessionId}
				organizationId={organizationId}
				deviceId={deviceId}
				workspaceId={workspaceId}
				cwd={workspace?.worktreePath ?? ""}
				paneId={paneId}
				tabId={tabId}
			/>
		</BasePaneWindow>
	);
}
