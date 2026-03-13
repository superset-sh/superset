import { ChatServiceProvider } from "@superset/chat/client";
import { ChatMastraServiceProvider } from "@superset/chat-mastra/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { CopyIcon } from "lucide-react";
import { useCallback } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { env } from "renderer/env.renderer";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { SplitPaneOptions, Tab } from "renderer/stores/tabs/types";
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
		options?: SplitPaneOptions,
	) => void;
	splitPaneVertical: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
		options?: SplitPaneOptions,
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
	const isFocused = useTabsStore((s) => s.focusedPaneIds[tabId] === paneId);
	const equalizePaneSplits = useTabsStore((s) => s.equalizePaneSplits);
	const paneName = useTabsStore((s) => s.panes[paneId]?.name ?? "New Chat");
	const setTabAutoTitle = useTabsStore((s) => s.setTabAutoTitle);
	const setPaneAutoTitle = useTabsStore((s) => s.setPaneAutoTitle);
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

	const applySubmittedMessageFallbackTitle = useCallback(
		(message: string) => {
			const normalized = message.trim().replace(/\s+/g, " ");
			if (!normalized) return;
			const fallbackTitle =
				normalized.length > 72
					? `${normalized.slice(0, 69).trimEnd()}...`
					: normalized;

			const state = useTabsStore.getState();
			const pane = state.panes[paneId];
			const tab = state.tabs.find((candidate) => candidate.id === tabId);
			const tabPaneCount = Object.values(state.panes).filter(
				(candidate) => candidate.tabId === tabId,
			).length;
			const paneName = pane?.name?.trim() ?? "";
			const tabName = tab?.name?.trim() ?? "";
			const hasCustomTabTitle = Boolean(tab?.userTitle?.trim());
			const shouldSetPaneTitle =
				paneName.length === 0 || paneName === "New Chat";
			const shouldSetTabTitle =
				!hasCustomTabTitle &&
				(tabName.length === 0 ||
					tabName === "New Chat" ||
					(tabPaneCount === 1 && pane?.type === "chat-mastra"));

			if (shouldSetPaneTitle) {
				setPaneAutoTitle(paneId, fallbackTitle);
			}
			if (shouldSetTabTitle) {
				setTabAutoTitle(tabId, fallbackTitle);
			}
		},
		[paneId, setPaneAutoTitle, setTabAutoTitle, tabId],
	);

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
							<div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
								<SessionSelector
									currentSessionId={sessionId}
									sessions={sessionItems}
									fallbackTitle={paneName}
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
						onSplitWithNewChat={() =>
							splitPaneVertical(tabId, paneId, path, {
								paneType: "chat-mastra",
							})
						}
						onSplitWithNewBrowser={() =>
							splitPaneVertical(tabId, paneId, path, { paneType: "webview" })
						}
						onEqualizePaneSplits={() => equalizePaneSplits(tabId)}
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
								isFocused={isFocused}
								isSessionReady={hasCurrentSessionRecord}
								ensureSessionReady={ensureCurrentSessionRecord}
								onStartFreshSession={handleStartFreshSession}
								onConsumeLaunchConfig={consumeLaunchConfig}
								onUserMessageSubmitted={applySubmittedMessageFallbackTitle}
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
