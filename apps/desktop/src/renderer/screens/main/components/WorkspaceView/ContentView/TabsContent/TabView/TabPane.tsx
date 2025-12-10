import { useEffect, useRef, useState } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { TbLayoutColumns, TbLayoutRows } from "react-icons/tb";
import type { MosaicBranch } from "react-mosaic-component";
import { MosaicWindow } from "react-mosaic-component";
import {
	registerPaneRef,
	unregisterPaneRef,
} from "renderer/stores/tabs/pane-refs";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";
import type { Pane, Tab } from "renderer/stores/tabs/types";
import { TabContentContextMenu } from "../TabContentContextMenu";
import { Terminal } from "../Terminal";

type SplitOrientation = "vertical" | "horizontal";

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
	const containerRef = useRef<HTMLDivElement>(null);
	const [splitOrientation, setSplitOrientation] =
		useState<SplitOrientation>("vertical");

	useEffect(() => {
		const container = containerRef.current;
		if (container) {
			registerPaneRef(paneId, container);
		}
		return () => {
			unregisterPaneRef(paneId);
		};
	}, [paneId]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const updateOrientation = () => {
			const { width, height } = container.getBoundingClientRect();
			setSplitOrientation(width >= height ? "vertical" : "horizontal");
		};

		updateOrientation();

		const resizeObserver = new ResizeObserver(updateOrientation);
		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
		};
	}, []);

	const handleFocus = () => {
		setFocusedPane(tabId, paneId);
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
		splitPaneAuto(tabId, paneId, { width, height }, path);
	};

	const getClearCallback = useTerminalCallbacksStore((s) => s.getClearCallback);
	const handleClearTerminal = () => {
		getClearCallback(paneId)?.();
	};

	const splitIcon =
		splitOrientation === "vertical" ? (
			<TbLayoutColumns className="size-4" />
		) : (
			<TbLayoutRows className="size-4" />
		);

	return (
		<MosaicWindow<string>
			path={path}
			title={pane.name}
			toolbarControls={
				<div className="flex items-center gap-0.5">
					<button
						type="button"
						onClick={handleSplitPane}
						title="Split pane"
						className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
					>
						{splitIcon}
					</button>
					<button
						type="button"
						onClick={handleClosePane}
						title="Close pane"
						className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
					>
						<HiMiniXMark className="size-4" />
					</button>
				</div>
			}
			className={isActive ? "mosaic-window-focused" : ""}
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
