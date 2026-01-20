import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { useDrop } from "react-dnd";
import { MosaicDragType } from "react-mosaic-component";
import { useDragPaneStore } from "renderer/stores/drag-pane-store";

interface NewTabDropZoneProps {
	onDrop: (paneId: string) => void;
	isLastPaneInTab: (paneId: string) => boolean;
	children: ReactNode;
}

export function NewTabDropZone({
	onDrop,
	isLastPaneInTab,
	children,
}: NewTabDropZoneProps) {
	const [{ isOver, canDrop }, drop] = useDrop({
		accept: MosaicDragType.WINDOW,
		canDrop: () => {
			const { draggingPaneId } = useDragPaneStore.getState();
			if (!draggingPaneId) return false;
			// Don't allow if it's the only pane in its tab
			return !isLastPaneInTab(draggingPaneId);
		},
		drop: () => {
			const { draggingPaneId } = useDragPaneStore.getState();
			if (!draggingPaneId) return;
			// Double-check it's not the last pane
			if (isLastPaneInTab(draggingPaneId)) return;
			onDrop(draggingPaneId);
		},
		collect: (monitor) => ({
			isOver: monitor.isOver(),
			canDrop: monitor.canDrop(),
		}),
	});

	return (
		<div
			ref={(node) => {
				drop(node);
			}}
			className={cn(
				"flex items-center h-full flex-1 min-w-0 transition-colors rounded",
				isOver && canDrop && "bg-primary/10 ring-1 ring-primary",
			)}
		>
			{children}
		</div>
	);
}
