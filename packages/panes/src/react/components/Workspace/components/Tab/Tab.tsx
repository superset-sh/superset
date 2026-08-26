import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { useEffect, useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceStore } from "../../../../../core/store";
import type {
	LayoutNode,
	SplitPath,
	Tab as TabType,
} from "../../../../../types";
import type {
	ContextMenuActionConfig,
	PaneActionConfig,
	PaneRegistry,
	RendererContext,
} from "../../../../types";
import { Pane } from "./components/Pane";
import {
	PANE_MIN_SIZE_CLASS_NAME,
	RESIZE_HANDLE_BASE_Z_INDEX,
	RESIZE_HANDLE_CLICK_MAX_MOVEMENT_PX,
	RESIZE_HANDLE_DOUBLE_CLICK_DELAY_MS,
} from "./constants";

interface TabProps<TData> {
	store: StoreApi<WorkspaceStore<TData>>;
	tab: TabType<TData>;
	registry: PaneRegistry<TData>;
	paneActions?:
		| PaneActionConfig<TData>[]
		| ((context: RendererContext<TData>) => PaneActionConfig<TData>[]);
	contextMenuActions?:
		| ContextMenuActionConfig<TData>[]
		| ((context: RendererContext<TData>) => ContextMenuActionConfig<TData>[]);
	onSplitResizeDragging?: (sourceId: string, isDragging: boolean) => void;
}

function SplitView<TData>({
	store,
	tab,
	node,
	path,
	registry,
	paneActions,
	contextMenuActions,
	onSplitResizeDragging,
}: {
	store: StoreApi<WorkspaceStore<TData>>;
	tab: TabType<TData>;
	node: Extract<LayoutNode, { type: "split" }>;
	path: SplitPath;
	registry: PaneRegistry<TData>;
	paneActions?: TabProps<TData>["paneActions"];
	contextMenuActions?: TabProps<TData>["contextMenuActions"];
	onSplitResizeDragging?: TabProps<TData>["onSplitResizeDragging"];
}) {
	const groupRef = useRef<React.ComponentRef<typeof ResizablePanelGroup>>(null);
	const activeHandlePointerRef = useRef<{
		pointerId: number;
		downAt: number;
		x: number;
		y: number;
		moved: boolean;
	} | null>(null);
	const lastHandleClickPointerDownAtRef = useRef<number | null>(null);
	const firstSize = node.splitPercentage ?? 50;
	const secondSize = 100 - firstSize;
	const resizeSourceId = `${tab.id}:${path.join(".") || "root"}`;

	useEffect(() => {
		return () => {
			onSplitResizeDragging?.(resizeSourceId, false);
		};
	}, [onSplitResizeDragging, resizeSourceId]);

	// `defaultSize` is only read when the group mounts, so a layout change that
	// comes from the store (equalize, a preset) has to be pushed through the
	// imperative handle or the panels stay where the user last dragged them.
	useEffect(() => {
		const group = groupRef.current;
		if (!group) return;

		const layout = group.getLayout();
		if (layout.length !== 2) return;
		if (Math.abs((layout[0] ?? 0) - firstSize) < 0.01) return;

		group.setLayout([firstSize, secondSize]);
	}, [firstSize, secondSize]);

	return (
		<ResizablePanelGroup
			ref={groupRef}
			className="min-h-full min-w-full overflow-auto"
			direction={node.direction}
			onLayout={(sizes) => {
				if (sizes[0] != null) {
					store.getState().resizeSplit({
						tabId: tab.id,
						path,
						splitPercentage: sizes[0],
					});
				}
			}}
		>
			<ResizablePanel
				className={PANE_MIN_SIZE_CLASS_NAME}
				defaultSize={firstSize}
			>
				<LayoutNodeView
					store={store}
					tab={tab}
					node={node.first}
					path={[...path, "first"]}
					registry={registry}
					paneActions={paneActions}
					contextMenuActions={contextMenuActions}
					onSplitResizeDragging={onSplitResizeDragging}
					parentDirection={node.direction}
				/>
			</ResizablePanel>
			<ResizableHandle
				// The active pane draws a 2px border on either side of the 1px
				// divider. Cover that full visual border with the sash hit area.
				hitAreaSize="large"
				style={{ zIndex: RESIZE_HANDLE_BASE_Z_INDEX - path.length }}
				onPointerDownCapture={(event) => {
					if (event.button !== 0 || !event.isPrimary) return;

					(event.currentTarget as unknown as HTMLElement).setPointerCapture(
						event.pointerId,
					);
					activeHandlePointerRef.current = {
						pointerId: event.pointerId,
						downAt: Date.now(),
						x: event.clientX,
						y: event.clientY,
						moved: false,
					};
				}}
				onPointerMoveCapture={(event) => {
					const activePointer = activeHandlePointerRef.current;
					if (!activePointer || activePointer.pointerId !== event.pointerId)
						return;

					if (
						Math.hypot(
							event.clientX - activePointer.x,
							event.clientY - activePointer.y,
						) > RESIZE_HANDLE_CLICK_MAX_MOVEMENT_PX
					) {
						activePointer.moved = true;
						lastHandleClickPointerDownAtRef.current = null;
					}
				}}
				onPointerUpCapture={(event) => {
					const activePointer = activeHandlePointerRef.current;
					activeHandlePointerRef.current = null;
					if (!activePointer || activePointer.pointerId !== event.pointerId)
						return;

					const moved =
						activePointer.moved ||
						Math.hypot(
							event.clientX - activePointer.x,
							event.clientY - activePointer.y,
						) > RESIZE_HANDLE_CLICK_MAX_MOVEMENT_PX;
					if (moved) {
						lastHandleClickPointerDownAtRef.current = null;
						return;
					}

					const lastClickAt = lastHandleClickPointerDownAtRef.current;
					if (
						lastClickAt === null ||
						activePointer.downAt - lastClickAt >
							RESIZE_HANDLE_DOUBLE_CLICK_DELAY_MS
					) {
						lastHandleClickPointerDownAtRef.current = activePointer.downAt;
						return;
					}

					lastHandleClickPointerDownAtRef.current = null;
					queueMicrotask(() => {
						store.getState().equalizeSplit({ tabId: tab.id, path });
					});
				}}
				onPointerCancel={() => {
					activeHandlePointerRef.current = null;
					lastHandleClickPointerDownAtRef.current = null;
				}}
				onDragging={(isDragging) =>
					onSplitResizeDragging?.(resizeSourceId, isDragging)
				}
			/>
			<ResizablePanel
				className={PANE_MIN_SIZE_CLASS_NAME}
				defaultSize={secondSize}
			>
				<LayoutNodeView
					store={store}
					tab={tab}
					node={node.second}
					path={[...path, "second"]}
					registry={registry}
					paneActions={paneActions}
					contextMenuActions={contextMenuActions}
					onSplitResizeDragging={onSplitResizeDragging}
					parentDirection={node.direction}
				/>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

function LayoutNodeView<TData>({
	store,
	tab,
	node,
	path,
	registry,
	paneActions,
	contextMenuActions,
	onSplitResizeDragging,
	parentDirection = null,
}: {
	store: StoreApi<WorkspaceStore<TData>>;
	tab: TabType<TData>;
	node: LayoutNode;
	path: SplitPath;
	registry: PaneRegistry<TData>;
	paneActions?: TabProps<TData>["paneActions"];
	contextMenuActions?: TabProps<TData>["contextMenuActions"];
	onSplitResizeDragging?: TabProps<TData>["onSplitResizeDragging"];
	parentDirection?: "horizontal" | "vertical" | null;
}) {
	// A persisted layout can be malformed — a split node with a missing
	// child, or a corrupt node shape from an older schema. Render nothing
	// rather than crashing the whole renderer on `node.type` of undefined.
	if (!node || (node.type !== "pane" && node.type !== "split")) {
		return null;
	}

	if (node.type === "pane") {
		const pane = tab.panes[node.paneId];
		if (!pane) return null;

		return (
			<Pane
				store={store}
				tab={tab}
				pane={pane}
				isActive={tab.activePaneId === pane.id}
				registry={registry}
				paneActions={paneActions}
				contextMenuActions={contextMenuActions}
				parentDirection={parentDirection}
			/>
		);
	}

	return (
		<SplitView
			store={store}
			tab={tab}
			node={node}
			path={path}
			registry={registry}
			paneActions={paneActions}
			contextMenuActions={contextMenuActions}
			onSplitResizeDragging={onSplitResizeDragging}
		/>
	);
}

export function Tab<TData>({
	store,
	tab,
	registry,
	paneActions,
	contextMenuActions,
	onSplitResizeDragging,
}: TabProps<TData>) {
	if (!tab.layout) {
		return (
			<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
				No panes open
			</div>
		);
	}

	return (
		// isolate contains the resize handles' z-indexes so they never paint
		// above body-portalled overlays (dialogs, menus).
		<div className="isolate flex h-full w-full min-h-0 min-w-0 flex-1 overflow-auto">
			<LayoutNodeView
				store={store}
				tab={tab}
				node={tab.layout}
				path={[]}
				registry={registry}
				paneActions={paneActions}
				contextMenuActions={contextMenuActions}
				onSplitResizeDragging={onSplitResizeDragging}
			/>
		</div>
	);
}
