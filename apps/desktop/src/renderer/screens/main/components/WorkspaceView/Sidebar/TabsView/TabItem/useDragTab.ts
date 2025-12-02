import { useDrag, useDrop } from "react-dnd";
import { useTabsStore } from "renderer/stores";
import { type DragItem, TAB_DND_TYPE } from "./types";

export function useDragTab(tabId: string) {
	const dragTabToTab = useTabsStore((state) => state.dragTabToTab);

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
				dragTabToTab(item.tabId, tabId);
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
