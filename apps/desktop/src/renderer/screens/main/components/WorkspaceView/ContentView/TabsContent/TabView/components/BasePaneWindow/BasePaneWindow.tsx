import { useRef } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { MosaicWindow } from "react-mosaic-component";
import { useDragPaneStore } from "renderer/stores/drag-pane-store";
import type { SplitOrientation } from "../../hooks";
import { useSplitOrientation } from "../../hooks";

export interface PaneHandlers {
	onFocus: () => void;
	onClosePane: (e: React.MouseEvent) => void;
	onSplitPane: (e: React.MouseEvent) => void;
	splitOrientation: SplitOrientation;
}

interface BasePaneWindowProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
	isActive: boolean;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
	renderToolbar: (handlers: PaneHandlers) => React.ReactElement;
	children: React.ReactNode;
	contentClassName?: string;
}

export function BasePaneWindow({
	paneId,
	path,
	tabId,
	isActive,
	splitPaneAuto,
	removePane,
	setFocusedPane,
	renderToolbar,
	children,
	contentClassName = "w-full h-full overflow-hidden",
}: BasePaneWindowProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const splitOrientation = useSplitOrientation(containerRef);
	const setDragging = useDragPaneStore((s) => s.setDragging);
	const clearDragging = useDragPaneStore((s) => s.clearDragging);

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

	const handlers: PaneHandlers = {
		onFocus: handleFocus,
		onClosePane: handleClosePane,
		onSplitPane: handleSplitPane,
		splitOrientation,
	};

	return (
		<MosaicWindow<string>
			path={path}
			title=""
			renderToolbar={() => renderToolbar(handlers)}
			className={isActive ? "mosaic-window-focused" : ""}
			onDragStart={() => setDragging(paneId, tabId)}
			onDragEnd={() => clearDragging()}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: Focus handler for pane */}
			<div
				ref={containerRef}
				className={contentClassName}
				onClick={handleFocus}
			>
				{children}
			</div>
		</MosaicWindow>
	);
}
