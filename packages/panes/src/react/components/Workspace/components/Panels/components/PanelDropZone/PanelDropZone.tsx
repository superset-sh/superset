import { useRef } from "react";
import { useDragLayer, useDrop } from "react-dnd";
import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceStore } from "../../../../../../../core/store";
import { deriveWorkspacePanels } from "../../../../../../../core/store/panels";
import type { SplitPosition } from "../../../../../../../types";
import { TAB_DRAG_TYPE } from "../../../TabBar/components/TabItem";
import { useDropPreviewStore } from "../../dropPreviewStore";

type PanelDropTarget = SplitPosition | "center";

type TabDragItem = { tabId: string };

/**
 * VS Code-style drop zones: the inner half of the panel means "move the tab
 * into this panel", the outer bands mean "split this panel on that edge".
 */
function getDropTarget(
	clientX: number,
	clientY: number,
	rect: DOMRect,
): PanelDropTarget {
	const x = (clientX - rect.left) / rect.width;
	const y = (clientY - rect.top) / rect.height;
	if (x >= 0.25 && x <= 0.75 && y >= 0.25 && y <= 0.75) {
		return "center";
	}
	const dx = x - 0.5;
	const dy = y - 0.5;
	if (Math.abs(dx) >= Math.abs(dy)) {
		return dx < 0 ? "left" : "right";
	}
	return dy < 0 ? "top" : "bottom";
}

interface PanelDropZoneProps<TData> {
	store: StoreApi<WorkspaceStore<TData>>;
	panelId: string;
}

/**
 * Invisible drop target over a panel's content area. It classifies the hover
 * into a zone and publishes it to the shared preview store; the actual
 * highlight is drawn once, accurately, by `DropPreviewOverlay`. Edge drops
 * split the panel; a center drop moves the tab into it.
 */
export function PanelDropZone<TData>({
	store,
	panelId,
}: PanelDropZoneProps<TData>) {
	const isTabDragging = useDragLayer(
		(monitor) =>
			monitor.isDragging() && monitor.getItemType() === TAB_DRAG_TYPE,
	);

	const containerRef = useRef<HTMLDivElement | null>(null);
	const targetRef = useRef<PanelDropTarget | null>(null);

	const [{ isOver }, connectDrop] = useDrop(
		() => ({
			accept: TAB_DRAG_TYPE,
			hover: (_item: TabDragItem, monitor) => {
				const el = containerRef.current;
				const offset = monitor.getClientOffset();
				if (!el || !offset) return;
				const rect = el.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) return;
				const next = getDropTarget(offset.x, offset.y, rect);
				if (next !== targetRef.current) {
					targetRef.current = next;
					useDropPreviewStore.getState().setPreview(panelId, next);
				}
			},
			drop: (item: TabDragItem) => {
				const dropTarget = targetRef.current ?? "center";
				targetRef.current = null;
				useDropPreviewStore.getState().clearPreview(panelId);

				const state = store.getState();
				if (dropTarget === "center") {
					const derived = deriveWorkspacePanels(state);
					if (derived.panelIdByTabId[item.tabId] === panelId) {
						// Already here — just select it
						state.setActiveTab(item.tabId);
					} else {
						state.moveTabToPanel({
							tabId: item.tabId,
							targetPanelId: panelId,
						});
					}
					return;
				}
				state.splitPanelWithTab({
					tabId: item.tabId,
					targetPanelId: panelId,
					position: dropTarget,
				});
			},
			collect: (monitor) => ({
				isOver: monitor.isOver({ shallow: true }),
			}),
		}),
		[store, panelId],
	);

	// Clear the shared preview when the cursor leaves this panel
	if (!isOver && targetRef.current !== null) {
		targetRef.current = null;
		useDropPreviewStore.getState().clearPreview(panelId);
	}

	if (!isTabDragging) return null;

	return (
		<div
			ref={(node) => {
				containerRef.current = node;
				connectDrop(node);
			}}
			className="absolute inset-0 z-20"
		/>
	);
}
