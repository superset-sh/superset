import { useDrop } from "react-dnd";
import { useTabsStore } from "renderer/stores";
import { type DragItem, TAB_DND_TYPE } from "./types";

export function useGroupDrop(groupId: string) {
	const dragTabToTab = useTabsStore((state) => state.dragTabToTab);

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
				dragTabToTab(item.tabId, groupId);
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
