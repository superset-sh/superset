import { cn } from "@superset/ui/utils";
import { useRef, useState } from "react";
import { useDrop } from "react-dnd";
import { MosaicDragType } from "react-mosaic-component";
import { useDragTabStore } from "renderer/stores/drag-tab-store";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { TabDragItem } from "../../../GroupStrip/GroupItem";

type DropZone = "center" | "left" | "right" | "top" | "bottom";

/**
 * VS Code-style drop zone: the inner half of the panel means "add to this
 * panel", the outer bands mean "split this panel on that edge".
 */
const zoneForPosition = (x: number, y: number): DropZone => {
	if (x >= 0.25 && x <= 0.75 && y >= 0.25 && y <= 0.75) {
		return "center";
	}
	// Pick the edge the pointer is displaced towards the most
	const dx = x - 0.5;
	const dy = y - 0.5;
	if (Math.abs(dx) >= Math.abs(dy)) {
		return dx < 0 ? "left" : "right";
	}
	return dy < 0 ? "top" : "bottom";
};

const ZONE_CLASSES: Record<DropZone, string> = {
	center: "inset-0",
	left: "inset-y-0 left-0 w-1/2",
	right: "inset-y-0 right-0 w-1/2",
	top: "inset-x-0 top-0 h-1/2",
	bottom: "inset-x-0 bottom-0 h-1/2",
};

interface PanelDropOverlayProps {
	panelId: string;
}

/**
 * Covers a panel's content area while a tab drag is in flight. Edge drops
 * split the panel (creating a new panel holding the dragged tab); a center
 * drop moves the tab into this panel.
 */
export function PanelDropOverlay({ panelId }: PanelDropOverlayProps) {
	const isTabDragging = useDragTabStore((s) => s.draggingTabId !== null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const zoneRef = useRef<DropZone | null>(null);
	const [zone, setZone] = useState<DropZone | null>(null);

	const [{ isOver }, drop] = useDrop<
		TabDragItem,
		{ handled: true },
		{ isOver: boolean }
	>(
		() => ({
			accept: MosaicDragType.WINDOW,
			canDrop: (item) => item.isTabDrag === true,
			hover: (_item, monitor) => {
				const container = containerRef.current;
				const offset = monitor.getClientOffset();
				if (!container || !offset) return;
				const rect = container.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) return;
				const nextZone = zoneForPosition(
					(offset.x - rect.left) / rect.width,
					(offset.y - rect.top) / rect.height,
				);
				zoneRef.current = nextZone;
				setZone((current) => (current === nextZone ? current : nextZone));
			},
			drop: (item) => {
				const dropZone = zoneRef.current ?? "center";
				const state = useTabsStore.getState();
				if (dropZone === "center") {
					// No-op when the tab is already in this panel
					if (item.panelId !== panelId) {
						state.moveTabToPanel(item.tabId, panelId);
					}
				} else {
					state.splitPanelWithTab(item.tabId, panelId, dropZone);
				}
				return { handled: true };
			},
			collect: (monitor) => ({
				isOver: monitor.isOver({ shallow: true }),
			}),
		}),
		[panelId],
	);

	if (!isTabDragging) {
		return null;
	}

	return (
		<div
			ref={(node) => {
				containerRef.current = node;
				drop(node);
			}}
			className="absolute inset-0 z-40"
		>
			{isOver && zone && (
				<div
					className={cn(
						"pointer-events-none absolute rounded-sm border border-primary/40 bg-primary/15 transition-all duration-75",
						ZONE_CLASSES[zone],
					)}
				/>
			)}
		</div>
	);
}
