import { Button } from "@superset/ui/button";
import { HiMiniXMark } from "react-icons/hi2";
import type { MosaicBranch } from "react-mosaic-component";
import { MosaicWindow } from "react-mosaic-component";
import type { Pane } from "renderer/stores/tabs/types";
import { TabContentContextMenu } from "../TabContentContextMenu";
import { Terminal } from "../Terminal";

interface WindowPaneProps {
	paneId: string;
	path: MosaicBranch[];
	pane: Pane;
	isActive: boolean;
	windowId: string;
	workspaceId: string;
	splitPaneHorizontal: (
		windowId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
	) => void;
	splitPaneVertical: (
		windowId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (windowId: string, paneId: string) => void;
}

export function WindowPane({
	paneId,
	path,
	pane,
	isActive,
	windowId,
	workspaceId,
	splitPaneHorizontal,
	splitPaneVertical,
	removePane,
	setFocusedPane,
}: WindowPaneProps) {
	const handleFocus = () => {
		setFocusedPane(windowId, paneId);
	};

	const handleClosePane = (e: React.MouseEvent) => {
		e.stopPropagation();
		removePane(paneId);
	};

	return (
		<MosaicWindow<string>
			path={path}
			title={pane.name}
			toolbarControls={
				<Button
					variant="link"
					size="icon"
					onClick={handleClosePane}
					title="Close pane"
					className="hover:text-white/80"
				>
					<HiMiniXMark className="size-4" />
				</Button>
			}
			className={isActive ? "mosaic-window-focused" : ""}
		>
			<TabContentContextMenu
				onSplitHorizontal={() => splitPaneHorizontal(windowId, paneId, path)}
				onSplitVertical={() => splitPaneVertical(windowId, paneId, path)}
				onClosePane={() => removePane(paneId)}
			>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: Terminal handles its own keyboard events and focus */}
				<div className="w-full h-full overflow-hidden" onClick={handleFocus}>
					<Terminal tabId={paneId} workspaceId={workspaceId} />
				</div>
			</TabContentContextMenu>
		</MosaicWindow>
	);
}
