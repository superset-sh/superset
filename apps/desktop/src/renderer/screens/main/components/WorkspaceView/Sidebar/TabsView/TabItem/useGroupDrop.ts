import { useDrop } from "react-dnd";
import { type DragItem, TAB_DND_TYPE } from "./types";

export function useGroupDrop(groupId: string) {
	const [{ isOver, canDrop }, drop] = useDrop<
		DragItem,
		void,
		{ isOver: boolean; canDrop: boolean }
	>({
		accept: TAB_DND_TYPE,
		drop: (item, monitor) => {
			// Only drop if not already handled by a child
			const didDrop = monitor.didDrop();
			if (!didDrop && item.tabId !== groupId) {
				// TODO: Implement drag-tab-to-group with tRPC mutations
				// This should add the dragged tab to the group's layout
				console.log("Drag tab to group not yet implemented", {
					draggedTabId: item.tabId,
					targetGroupId: groupId,
				});
			}
		},
		collect: (monitor) => ({
			isOver: monitor.isOver({ shallow: true }),
			canDrop: monitor.canDrop(),
		}),
	});

	const isDragOver = isOver && canDrop;

	return { drop, isDragOver };
}
