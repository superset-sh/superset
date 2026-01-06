import { useEffect, useRef } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import {
	registerPaneRef,
	unregisterPaneRef,
} from "renderer/stores/tabs/pane-refs";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";
import type { Pane, Tab } from "renderer/stores/tabs/types";
import { TabContentContextMenu } from "../TabContentContextMenu";
import { Terminal } from "../Terminal";
import { DirectoryNavigator } from "../Terminal/DirectoryNavigator";
import { BasePaneWindow, PaneToolbarActions } from "./components";

interface TabPaneProps {
	paneId: string;
	path: MosaicBranch[];
	pane: Pane;
	isActive: boolean;
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
	pane,
	isActive,
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
	const terminalContainerRef = useRef<HTMLDivElement>(null);
	const getClearCallback = useTerminalCallbacksStore((s) => s.getClearCallback);

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
							currentCwd={pane.cwd}
							cwdConfirmed={pane.cwdConfirmed}
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
				currentTabId={tabId}
				availableTabs={availableTabs}
				onMoveToTab={onMoveToTab}
				onMoveToNewTab={onMoveToNewTab}
			>
				<div ref={terminalContainerRef} className="w-full h-full">
					<Terminal tabId={paneId} workspaceId={workspaceId} />
				</div>
			</TabContentContextMenu>
		</BasePaneWindow>
	);
}
