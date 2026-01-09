import { useEffect, useRef } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import {
	registerPaneRef,
	unregisterPaneRef,
} from "renderer/stores/tabs/pane-refs";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";
import type { Tab } from "renderer/stores/tabs/types";
import { TabContentContextMenu } from "../TabContentContextMenu";
import { Terminal } from "../Terminal";
import { DirectoryNavigator } from "../Terminal/DirectoryNavigator";
import { BasePaneWindow, PaneToolbarActions } from "./components";

interface TabPaneProps {
	paneId: string;
	path: MosaicBranch[];
	isActive: boolean;
	isTabVisible: boolean;
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

export function TabPane({
	paneId,
	path,
	isActive,
	isTabVisible,
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
}: TabPaneProps) {
	// Use granular selector to only get this pane's cwd data
	const paneCwd = useTabsStore((s) => s.panes[paneId]?.cwd);
	const paneCwdConfirmed = useTabsStore((s) => s.panes[paneId]?.cwdConfirmed);

	const terminalContainerRef = useRef<HTMLDivElement>(null);
	const getClearCallback = useTerminalCallbacksStore((s) => s.getClearCallback);
	const getScrollToBottomCallback = useTerminalCallbacksStore(
		(s) => s.getScrollToBottomCallback,
	);

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
						<DirectoryNavigator
							paneId={paneId}
							currentCwd={paneCwd}
							cwdConfirmed={paneCwdConfirmed}
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
			<TabContentContextMenu
				onSplitHorizontal={() => splitPaneHorizontal(tabId, paneId, path)}
				onSplitVertical={() => splitPaneVertical(tabId, paneId, path)}
				onClosePane={() => removePane(paneId)}
				onClearTerminal={handleClearTerminal}
				onScrollToBottom={handleScrollToBottom}
				currentTabId={tabId}
				availableTabs={availableTabs}
				onMoveToTab={onMoveToTab}
				onMoveToNewTab={onMoveToNewTab}
			>
				<div ref={terminalContainerRef} className="w-full h-full">
					<Terminal
						tabId={paneId}
						workspaceId={workspaceId}
						isTabVisible={isTabVisible}
					/>
				</div>
			</TabContentContextMenu>
		</BasePaneWindow>
	);
}
