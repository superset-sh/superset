import { cn } from "@superset/ui/utils";
import { useContext, useEffect, useRef } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { MosaicWindow, MosaicWindowContext } from "react-mosaic-component";
import { useDragPaneStore } from "renderer/stores/drag-pane-store";
import { useFocusFollowsMouse } from "renderer/stores/pane-preferences";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { SplitOrientation } from "../../hooks";
import { useSplitOrientation } from "../../hooks";
import { createHoverFocusTimer, type HoverFocusTimer } from "./hoverFocusTimer";
import { useHoverFocusSuppression } from "./useHoverFocusSuppression";

export interface PaneHandlers {
	onFocus: () => void;
	onClosePane: (e: React.MouseEvent) => void;
	onSplitPane: (e: React.MouseEvent) => void;
	splitOrientation: SplitOrientation;
}

const FOCUS_FOLLOWS_MOUSE_DELAY_MS = 75;

/**
 * Connects drag source for root panes (single pane in a tab).
 * react-mosaic-component skips drag connection for root panes (path=[]),
 * but we need it for cross-tab drag-and-drop.
 */
function RootDraggable({ children }: { children: React.ReactNode }) {
	const { mosaicWindowActions } = useContext(MosaicWindowContext);
	return mosaicWindowActions.connectDragSource(
		<div className="h-full w-full">{children}</div>,
	);
}

interface BasePaneWindowProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
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
	splitPaneAuto,
	removePane,
	setFocusedPane,
	renderToolbar,
	children,
	contentClassName = "w-full h-full overflow-hidden",
}: BasePaneWindowProps) {
	const isActive = useTabsStore((s) => s.focusedPaneIds[tabId] === paneId);
	const workspaceRunState = useTabsStore(
		(s) => s.panes[paneId]?.workspaceRun?.state,
	);
	const containerRef = useRef<HTMLDivElement>(null);
	const splitOrientation = useSplitOrientation(containerRef);
	const isDragging = useDragPaneStore((s) => s.draggingPaneId !== null);
	const isResizing = useDragPaneStore((s) => s.isResizing);
	const setDragging = useDragPaneStore((s) => s.setDragging);
	const clearDragging = useDragPaneStore((s) => s.clearDragging);
	const focusFollowsMouse = useFocusFollowsMouse();
	const isSuppressed = useHoverFocusSuppression();
	const timerRef = useRef<HoverFocusTimer | null>(null);

	useEffect(() => {
		if (!focusFollowsMouse) {
			timerRef.current?.dispose();
			timerRef.current = null;
			return;
		}
		timerRef.current = createHoverFocusTimer({
			delayMs: FOCUS_FOLLOWS_MOUSE_DELAY_MS,
			onFire: () => {
				// Defensive: if window lost focus between suppression check and
				// fire (microtask race), bail.
				if (!document.hasFocus()) return;
				// Read action imperatively to avoid an extra store subscription
				// for a value (the action) that is stable for the store's lifetime.
				useTabsStore.getState().setFocusedPane(tabId, paneId);
			},
			// `isSuppressed` is required in deps for correctness if it ever
			// becomes non-stable; today useHoverFocusSuppression returns a
			// useCallback([])-stable reference so the dep is a no-op.
			isSuppressed,
		});
		return () => {
			timerRef.current?.dispose();
			timerRef.current = null;
		};
	}, [focusFollowsMouse, isSuppressed, tabId, paneId]);

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

	const handleMouseEnter = () => {
		if (isActive) return;
		timerRef.current?.enter();
	};

	const handleMouseLeave = () => {
		timerRef.current?.leave();
	};

	const handlers: PaneHandlers = {
		onFocus: handleFocus,
		onClosePane: handleClosePane,
		onSplitPane: handleSplitPane,
		splitOrientation,
	};

	const isRoot = path.length === 0;

	return (
		<MosaicWindow<string>
			path={path}
			title=""
			renderToolbar={() =>
				isRoot ? (
					<RootDraggable>{renderToolbar(handlers)}</RootDraggable>
				) : (
					renderToolbar(handlers)
				)
			}
			className={cn(
				isActive && "mosaic-window-focused",
				workspaceRunState && `workspace-run-pane-${workspaceRunState}`,
			)}
			onDragStart={() => setDragging(paneId, tabId)}
			onDragEnd={() => clearDragging()}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: Focus handler for pane */}
			<div
				ref={containerRef}
				className={contentClassName}
				style={isDragging || isResizing ? { pointerEvents: "none" } : undefined}
				onClick={handleFocus}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
			>
				{children}
			</div>
		</MosaicWindow>
	);
}
