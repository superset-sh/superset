import { useCallback } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { generateId } from "renderer/stores/tabs/utils";
import { BasePaneWindow, PaneToolbarActions } from "../components";
import { ChatInterface } from "./ChatInterface";
import { SessionSelector } from "./components/SessionSelector";

interface ChatPaneProps {
	paneId: string;
	path: MosaicBranch[];
	isActive: boolean;
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
	isActive,
	tabId,
	workspaceId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: ChatPaneProps) {
	const pane = useTabsStore((s) => s.panes[paneId]);
	const switchChatSession = useTabsStore((s) => s.switchChatSession);
	const sessionId = pane?.chat?.sessionId ?? "";

	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);

	const deleteSession = electronTrpc.aiChat.deleteSession.useMutation();

	const handleSelectSession = useCallback(
		(newSessionId: string) => {
			switchChatSession(paneId, newSessionId);
		},
		[paneId, switchChatSession],
	);

	const handleNewChat = useCallback(() => {
		const newSessionId = generateId("chat-session");
		switchChatSession(paneId, newSessionId);
	}, [paneId, switchChatSession]);

	const handleDeleteSession = useCallback(
		(sessionIdToDelete: string) => {
			deleteSession.mutate({ sessionId: sessionIdToDelete });
			if (sessionIdToDelete === sessionId) {
				handleNewChat();
			}
		},
		[deleteSession, sessionId, handleNewChat],
	);

	return (
		<BasePaneWindow
			paneId={paneId}
			path={path}
			tabId={tabId}
			isActive={isActive}
			splitPaneAuto={splitPaneAuto}
			removePane={removePane}
			setFocusedPane={setFocusedPane}
			renderToolbar={(handlers) => (
				<div className="flex h-full w-full items-center justify-between px-3">
					<div className="flex min-w-0 items-center gap-2">
						<SessionSelector
							workspaceId={workspaceId}
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
				workspaceId={workspaceId}
				cwd={workspace?.worktreePath ?? ""}
				paneId={paneId}
				tabId={tabId}
			/>
		</BasePaneWindow>
	);
}
