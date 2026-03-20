import { useCallback } from "react";
import { LuFolderTree } from "react-icons/lu";
import type { MosaicBranch } from "react-mosaic-component";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { SplitPaneOptions, Tab } from "renderer/stores/tabs/types";
import { FilesView } from "../../../../RightSidebar/FilesView";
import { TabContentContextMenu } from "../../TabContentContextMenu";
import { BasePaneWindow, type PaneHandlers } from "../components";
import { PaneToolbarActions } from "../components/PaneToolbarActions";

interface FileTreePaneProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
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

export function FileTreePane({
	paneId,
	path,
	tabId,
	splitPaneAuto,
	splitPaneHorizontal,
	splitPaneVertical,
	removePane,
	setFocusedPane,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
}: FileTreePaneProps) {
	const equalizePaneSplits = useTabsStore((s) => s.equalizePaneSplits);

	const handleRemove = useCallback(() => {
		removePane(paneId);
	}, [paneId, removePane]);

	const renderToolbar = useCallback(
		(handlers: PaneHandlers) => (
			<div className="flex h-full w-full items-center">
				<PaneToolbarActions
					splitOrientation={handlers.splitOrientation}
					onSplitPane={handlers.onSplitPane}
					onClosePane={handlers.onClosePane}
					leadingActions={
						<div className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground font-medium">
							<LuFolderTree className="size-3.5" />
							Files
						</div>
					}
				/>
			</div>
		),
		[],
	);

	return (
		<BasePaneWindow
			paneId={paneId}
			path={path}
			tabId={tabId}
			splitPaneAuto={splitPaneAuto}
			removePane={removePane}
			setFocusedPane={setFocusedPane}
			renderToolbar={renderToolbar}
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
					splitPaneVertical(tabId, paneId, path, {
						paneType: "webview",
					})
				}
				onSplitWithFileTree={() =>
					splitPaneVertical(tabId, paneId, path, {
						paneType: "file-tree",
					})
				}
				onEqualizePaneSplits={() => equalizePaneSplits(tabId)}
				onClosePane={handleRemove}
				currentTabId={tabId}
				availableTabs={availableTabs}
				onMoveToTab={onMoveToTab}
				onMoveToNewTab={onMoveToNewTab}
				closeLabel="Close File Tree"
			>
				<div className="h-full w-full overflow-hidden">
					<FilesView />
				</div>
			</TabContentContextMenu>
		</BasePaneWindow>
	);
}
