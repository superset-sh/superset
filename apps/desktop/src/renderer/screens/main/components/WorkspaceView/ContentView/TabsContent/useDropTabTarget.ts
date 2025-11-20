import { useDrop } from "react-dnd";
import type { Tab } from "renderer/stores";
import { useTabsStore } from "renderer/stores";
import { type DragItem, TAB_DND_TYPE } from "./types";

export function useDropTabTarget(activeTab: Tab | null) {
	const dragTabToTab = useTabsStore((state) => state.dragTabToTab);

	const [{ isOver, canDrop }, drop] = useDrop<
		DragItem,
		void,
		{ isOver: boolean; canDrop: boolean }
	>({
		accept: TAB_DND_TYPE,
		drop: (item) => {
			// Only allow drop if there's an active tab and it's different from dragged tab
			if (activeTab && item.tabId !== activeTab.id) {
				dragTabToTab(item.tabId, activeTab.id);
			}
		},
		canDrop: (item) => {
			// Can only drop if there's an active tab and it's different from the dragged tab
			return activeTab !== null && item.tabId !== activeTab.id;
		},
		collect: (monitor) => ({
			isOver: monitor.isOver(),
			canDrop: monitor.canDrop(),
		}),
	});

	const isDropZone = isOver && canDrop;

	return { drop, isDropZone };
}
