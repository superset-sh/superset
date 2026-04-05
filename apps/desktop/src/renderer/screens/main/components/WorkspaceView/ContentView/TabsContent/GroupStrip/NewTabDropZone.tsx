import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { useDrop } from "react-dnd";
import { MosaicDragType } from "react-mosaic-component";
import { useDragPaneStore } from "renderer/stores/drag-pane-store";

interface NewTabDropZoneProps {
	onDrop: (paneId: string) => void;
	isLastPaneInTab: (paneId: string) => boolean;
	orientation?: "horizontal" | "vertical";
	children: ReactNode;
}

export function NewTabDropZone({
	onDrop,
	isLastPaneInTab,
	orientation = "horizontal",
	children,
}: NewTabDropZoneProps) {
	const isVertical = orientation === "vertical";
	const [{ isOver, canDrop }, drop] = useDrop<
		unknown,
		{ handled: true },
		{ isOver: boolean; canDrop: boolean }
	>(
		() => ({
			accept: MosaicDragType.WINDOW,
			canDrop: () => {
				const { draggingPaneId } = useDragPaneStore.getState();
				if (!draggingPaneId) return false;
				return !isLastPaneInTab(draggingPaneId);
			},
			drop: () => {
				const { draggingPaneId, clearDragging } = useDragPaneStore.getState();
				if (draggingPaneId && !isLastPaneInTab(draggingPaneId)) {
					onDrop(draggingPaneId);
				}
				clearDragging();
				return { handled: true };
			},
			collect: (monitor) => ({
				isOver: monitor.isOver(),
				canDrop: monitor.canDrop(),
			}),
		}),
		[onDrop, isLastPaneInTab],
	);

	return (
		<div
			ref={(node) => {
				drop(node);
			}}
			className={cn(
				"relative flex items-center shrink-0 pl-2",
				isVertical ? "w-full pt-2" : "h-full",
			)}
		>
			{isOver && canDrop && (
				<div
					className={cn(
						"absolute left-0 top-0 bg-primary/20",
						isVertical ? "right-0 h-1" : "bottom-0 w-1",
					)}
				/>
			)}
			{children}
		</div>
	);
}
