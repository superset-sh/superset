import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useRef } from "react";
import { TbExternalLink } from "react-icons/tb";
import type { MosaicBranch } from "react-mosaic-component";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import {
	registerPaneRef,
	unregisterPaneRef,
} from "renderer/stores/tabs/pane-refs";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";
import type { SplitPaneOptions, Tab } from "renderer/stores/tabs/types";
import { TabContentContextMenu } from "../TabContentContextMenu";
import { Terminal } from "../Terminal";
import { BasePaneWindow, PaneToolbarActions } from "./components";

interface TabPaneProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
	workspaceId: string;
	workspaceName?: string;
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

export function TabPane({
	paneId,
	path,
	tabId,
	workspaceId,
	workspaceName,
	splitPaneAuto,
	splitPaneHorizontal,
	splitPaneVertical,
	removePane,
	setFocusedPane,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
}: TabPaneProps) {
	const paneName = useTabsStore((s) => s.panes[paneId]?.name);
	const paneStatus = useTabsStore((s) => s.panes[paneId]?.status);
	const openPaneWindowMutation = electronTrpc.window.openPane.useMutation();

	const terminalContainerRef = useRef<HTMLDivElement>(null);
	const getClearCallback = useTerminalCallbacksStore((s) => s.getClearCallback);
	const getScrollToBottomCallback = useTerminalCallbacksStore(
		(s) => s.getScrollToBottomCallback,
	);
	const getGetSelectionCallback = useTerminalCallbacksStore(
		(s) => s.getGetSelectionCallback,
	);
	const getPasteCallback = useTerminalCallbacksStore((s) => s.getPasteCallback);

	useEffect(() => {
		const container = terminalContainerRef.current;
		if (container) {
			registerPaneRef(paneId, container);
		}
		return () => {
			unregisterPaneRef(paneId);
		};
	}, [paneId]);

	const handleClearTerminal = () => {
		getClearCallback(paneId)?.();
	};

	const handleScrollToBottom = () => {
		getScrollToBottomCallback(paneId)?.();
	};

	const handleOpenPaneWindow = () => {
		openPaneWindowMutation.mutate({
			paneId,
			paneName: paneName || "Terminal",
			workspaceName: workspaceName?.trim() || undefined,
		});
	};

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
						<span className="truncate text-sm text-muted-foreground">
							{paneName || "Terminal"}
						</span>
						{paneStatus && paneStatus !== "idle" && (
							<StatusIndicator status={paneStatus} />
						)}
					</div>
					<PaneToolbarActions
						splitOrientation={handlers.splitOrientation}
						onSplitPane={handlers.onSplitPane}
						onClosePane={handlers.onClosePane}
						closeHotkeyId="CLOSE_TERMINAL"
						leadingActions={
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										aria-label="Open pane in new window"
										title="Open in window"
										onClick={handleOpenPaneWindow}
										disabled={openPaneWindowMutation.isPending}
										className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
									>
										<TbExternalLink className="size-3.5" />
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom" showArrow={false}>
									Open in window
								</TooltipContent>
							</Tooltip>
						}
					/>
				</div>
			)}
		>
			<TabContentContextMenu
				onSplitHorizontal={() => splitPaneHorizontal(tabId, paneId, path)}
				onSplitVertical={() => splitPaneVertical(tabId, paneId, path)}
				onSplitWithNewChat={() =>
					splitPaneVertical(tabId, paneId, path, { paneType: "chat-mastra" })
				}
				onSplitWithNewBrowser={() =>
					splitPaneVertical(tabId, paneId, path, { paneType: "webview" })
				}
				onClosePane={() => removePane(paneId)}
				onClearTerminal={handleClearTerminal}
				onScrollToBottom={handleScrollToBottom}
				getSelection={() => getGetSelectionCallback(paneId)?.() ?? ""}
				onPaste={(text) => getPasteCallback(paneId)?.(text)}
				currentTabId={tabId}
				availableTabs={availableTabs}
				onMoveToTab={onMoveToTab}
				onMoveToNewTab={onMoveToNewTab}
				closeLabel="Close Terminal"
			>
				<div ref={terminalContainerRef} className="w-full h-full">
					<Terminal paneId={paneId} tabId={tabId} workspaceId={workspaceId} />
				</div>
			</TabContentContextMenu>
		</BasePaneWindow>
	);
}
