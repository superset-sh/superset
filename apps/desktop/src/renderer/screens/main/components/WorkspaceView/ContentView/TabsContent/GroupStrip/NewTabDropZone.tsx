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
			className="relative flex items-center h-full flex-1 min-w-0 pl-2"
		>
			{isOver && canDrop && (
				<div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/20" />
			)}
			{children}
		</div>
	);
}
