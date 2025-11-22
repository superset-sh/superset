import { useDrop } from "react-dnd";
import type { Tab } from "main/lib/trpc/routers/tabs";
import { type DragItem, TAB_DND_TYPE } from "./types";

export function useTabContentDrop(tabToRender: Tab | null) {
	const [{ isOver, canDrop }, drop] = useDrop<
		DragItem,
		void,
		{ isOver: boolean; canDrop: boolean }
	>({
		accept: TAB_DND_TYPE,
		drop: (item) => {
			if (tabToRender) {
				// TODO: Implement drag-to-tab logic with tRPC mutations
				// This should handle:
				// 1. Dragging tab into itself - creates new tab and makes a group
				// 2. Dragging into child tab - redirects to parent group
				// 3. Dragging into group tab - adds to existing split view
				// 4. Dragging single tab into another single tab - creates new group container
				console.log("Drag tab to tab not yet implemented", {
					draggedTabId: item.tabId,
					targetTabId: tabToRender.id,
				});
			}
		},
		canDrop: () => {
			return tabToRender !== null;
		},
		collect: (monitor) => ({
			isOver: monitor.isOver(),
			canDrop: monitor.canDrop(),
		}),
	});

	const isDropZone = isOver && canDrop;

	const attachDrop = (node: HTMLDivElement | null) => {
		if (node) drop(node);
	};

	return { isDropZone, attachDrop };
}
