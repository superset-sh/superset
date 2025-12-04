import { useRef } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { TbLayoutColumns, TbLayoutRows } from "react-icons/tb";
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
	const containerRef = useRef<HTMLDivElement>(null);

	const handleFocus = () => {
		setFocusedPane(windowId, paneId);
	};

	const handleClosePane = (e: React.MouseEvent) => {
		e.stopPropagation();
		removePane(paneId);
	};

	const handleSplitPane = (e: React.MouseEvent) => {
		e.stopPropagation();
		const container = containerRef.current;
		if (!container) return;

		const { width, height } = container.getBoundingClientRect();
		// Split along the longer axis: wide panes split vertically (side-by-side),
		// tall panes split horizontally (top-bottom)
		if (width >= height) {
			splitPaneVertical(windowId, paneId, path);
		} else {
			splitPaneHorizontal(windowId, paneId, path);
		}
	};

	// Determine which icon to show based on current dimensions
	const getSplitIcon = () => {
		const container = containerRef.current;
		if (!container) {
			// Default to vertical split icon (columns) as most panes are wider
			return <TbLayoutColumns className="size-4" />;
		}
		const { width, height } = container.getBoundingClientRect();
		return width >= height ? (
			<TbLayoutColumns className="size-4" />
		) : (
			<TbLayoutRows className="size-4" />
		);
	};

	return (
		<MosaicWindow<string>
			path={path}
			title={pane.name}
			toolbarControls={
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={handleSplitPane}
						title="Split pane"
						className="rounded-full p-0.5 hover:bg-white/10"
					>
						{getSplitIcon()}
					</button>
					<button
						type="button"
						onClick={handleClosePane}
						title="Close pane"
						className="rounded-full p-0.5 hover:bg-white/10"
					>
						<HiMiniXMark className="size-4" />
					</button>
				</div>
			}
			className={isActive ? "mosaic-window-focused" : ""}
		>
			<TabContentContextMenu
				onSplitHorizontal={() => splitPaneHorizontal(windowId, paneId, path)}
				onSplitVertical={() => splitPaneVertical(windowId, paneId, path)}
				onClosePane={() => removePane(paneId)}
			>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: Terminal handles its own keyboard events and focus */}
				<div
					ref={containerRef}
					className="w-full h-full overflow-hidden"
					onClick={handleFocus}
				>
					<Terminal tabId={paneId} workspaceId={workspaceId} />
				</div>
			</TabContentContextMenu>
		</MosaicWindow>
	);
}
