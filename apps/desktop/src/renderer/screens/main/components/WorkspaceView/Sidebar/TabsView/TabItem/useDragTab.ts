import { useDrag, useDrop } from "react-dnd";
import { type DragItem, TAB_DND_TYPE } from "./types";

export function useDragTab(tabId: string) {
	// Set up drag source
	const [{ isDragging }, drag] = useDrag<
		DragItem,
		void,
		{ isDragging: boolean }
	>({
		type: TAB_DND_TYPE,
		item: { type: TAB_DND_TYPE, tabId },
		collect: (monitor) => ({
			isDragging: monitor.isDragging(),
		}),
	});

	// Set up drop target
	const [{ isOver, canDrop }, drop] = useDrop<
		DragItem,
		void,
		{ isOver: boolean; canDrop: boolean }
	>({
		accept: TAB_DND_TYPE,
		drop: (item) => {
			if (item.tabId !== tabId) {
				// TODO: Implement drag-tab-to-tab with tRPC mutations
				console.log("Drag tab to tab not yet implemented", {
					draggedTabId: item.tabId,
					targetTabId: tabId,
				});
			}
		},
		collect: (monitor) => ({
			isOver: monitor.isOver(),
			canDrop: monitor.canDrop(),
		}),
	});

	const isDragOver = isOver && canDrop;

	return { drag, drop, isDragging, isDragOver };
}
