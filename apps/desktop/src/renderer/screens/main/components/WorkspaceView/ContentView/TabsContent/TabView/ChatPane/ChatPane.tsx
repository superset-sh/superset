import {
	ChatRuntimeServiceProvider,
	ChatServiceProvider,
} from "@superset/chat/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { CopyIcon } from "lucide-react";
import { useCallback } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { createChatServiceIpcClient } from "renderer/components/Chat/utils/chat-service-client";
import { env } from "renderer/env.renderer";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { SplitPaneOptions, Tab } from "renderer/stores/tabs/types";
import { TabContentContextMenu } from "../../TabContentContextMenu";
import { BasePaneWindow, PaneToolbarActions } from "../components";
import { ChatPaneInterface } from "./ChatPaneInterface";
import { SessionSelector } from "./components/SessionSelector";
import { useChatPaneController } from "./hooks/useChatPaneController";
import { useChatRawSnapshot } from "./hooks/useChatRawSnapshot";
import { createChatRuntimeServiceIpcClient } from "./utils/chat-runtime-service-client";

const chatRuntimeIpcClient = createChatRuntimeServiceIpcClient();
const chatIpcClient = createChatServiceIpcClient();

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

export function ChatPane({
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
}: ChatPaneProps) {
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
	} = useChatPaneController({
		paneId,
		workspaceId,
	});
	const {
		snapshotAvailableForSession,
		handleRawSnapshotChange,
		handleCopyRawSnapshot,
	} = useChatRawSnapshot({ sessionId });

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
					(tabPaneCount === 1 && pane?.type === "chat"));

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
		<ChatRuntimeServiceProvider
			client={chatRuntimeIpcClient}
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
								paneType: "chat",
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
							<ChatPaneInterface
								paneId={paneId}
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
		</ChatRuntimeServiceProvider>
	);
}
