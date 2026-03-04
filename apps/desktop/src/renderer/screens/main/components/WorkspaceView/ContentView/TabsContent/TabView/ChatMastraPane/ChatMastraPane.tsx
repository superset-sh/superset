import { ChatServiceProvider } from "@superset/chat/client";
import { ChatMastraServiceProvider } from "@superset/chat-mastra/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { CopyIcon } from "lucide-react";
import type { MosaicBranch } from "react-mosaic-component";
import { env } from "renderer/env.renderer";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import type { Tab } from "renderer/stores/tabs/types";
import { TabContentContextMenu } from "../../TabContentContextMenu";
import { createChatServiceIpcClient } from "../ChatPane/utils/chat-service-client";
import { BasePaneWindow, PaneToolbarActions } from "../components";
import { ChatMastraInterface } from "./ChatMastraInterface";
import { SessionSelector } from "./components/SessionSelector";
import { useChatMastraPaneController } from "./hooks/useChatMastraPaneController";
import { useChatMastraRawSnapshot } from "./hooks/useChatMastraRawSnapshot";
import { createChatMastraServiceIpcClient } from "./utils/chat-mastra-service-client";

const mastraIpcClient = createChatMastraServiceIpcClient();
const chatIpcClient = createChatServiceIpcClient();

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
	splitPaneHorizontal: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
	) => void;
	splitPaneVertical: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
	availableTabs: Tab[];
	onMoveToTab: (targetTabId: string) => void;
	onMoveToNewTab: () => void;
}

export function ChatMastraPane({
	paneId,
	path,
	tabId,
	workspaceId,
	splitPaneAuto,
	splitPaneHorizontal,
	splitPaneVertical,
	removePane,
	setFocusedPane,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
}: ChatMastraPaneProps) {
	const showDevToolbarActions = env.NODE_ENV === "development";
	const {
		sessionId,
		launchConfig,
		organizationId,
		workspacePath,
		isSessionInitializing,
		hasCurrentSessionRecord,
		sessionItems,
		handleSelectSession,
		handleNewChat,
		handleStartFreshSession,
		handleDeleteSession,
		ensureCurrentSessionRecord,
		consumeLaunchConfig,
	} = useChatMastraPaneController({
		paneId,
		workspaceId,
	});
	const {
		snapshotAvailableForSession,
		handleRawSnapshotChange,
		handleCopyRawSnapshot,
	} = useChatMastraRawSnapshot({ sessionId });

	return (
		<ChatMastraServiceProvider
			client={mastraIpcClient}
			queryClient={electronQueryClient}
		>
			<ChatServiceProvider
				client={chatIpcClient}
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
									isSessionInitializing={isSessionInitializing}
									onSelectSession={handleSelectSession}
									onNewChat={handleNewChat}
									onDeleteSession={handleDeleteSession}
								/>
							</div>
							<PaneToolbarActions
								splitOrientation={handlers.splitOrientation}
								onSplitPane={handlers.onSplitPane}
								onClosePane={handlers.onClosePane}
								leadingActions={
									showDevToolbarActions ? (
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={() => {
														void handleCopyRawSnapshot();
													}}
													disabled={!snapshotAvailableForSession}
													className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
												>
													<CopyIcon className="size-3.5" />
												</button>
											</TooltipTrigger>
											<TooltipContent side="bottom" showArrow={false}>
												Copy raw chat JSON (dev)
											</TooltipContent>
										</Tooltip>
									) : null
								}
								closeHotkeyId="CLOSE_TERMINAL"
							/>
						</div>
					)}
				>
					<TabContentContextMenu
						onSplitHorizontal={() => splitPaneHorizontal(tabId, paneId, path)}
						onSplitVertical={() => splitPaneVertical(tabId, paneId, path)}
						onClosePane={() => removePane(paneId)}
						currentTabId={tabId}
						availableTabs={availableTabs}
						onMoveToTab={onMoveToTab}
						onMoveToNewTab={onMoveToNewTab}
						closeLabel="Close Chat"
					>
						<div className="h-full w-full">
							<ChatMastraInterface
								sessionId={sessionId}
								initialLaunchConfig={launchConfig}
								workspaceId={workspaceId}
								organizationId={organizationId}
								cwd={workspacePath}
								isSessionReady={hasCurrentSessionRecord}
								ensureSessionReady={ensureCurrentSessionRecord}
								onStartFreshSession={handleStartFreshSession}
								onConsumeLaunchConfig={consumeLaunchConfig}
								onRawSnapshotChange={
									showDevToolbarActions ? handleRawSnapshotChange : undefined
								}
							/>
						</div>
					</TabContentContextMenu>
				</BasePaneWindow>
			</ChatServiceProvider>
		</ChatMastraServiceProvider>
	);
}
