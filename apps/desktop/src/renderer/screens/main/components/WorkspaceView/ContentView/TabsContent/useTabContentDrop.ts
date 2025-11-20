import { useDrop } from "react-dnd";
import type { Tab } from "renderer/stores";
import { useTabsStore } from "renderer/stores";
import { type DragItem, TAB_DND_TYPE } from "./types";

export function useTabContentDrop(tabToRender: Tab | null) {
	const dragTabToTab = useTabsStore((state) => state.dragTabToTab);

	const [{ isOver, canDrop }, drop] = useDrop<
		DragItem,
		void,
		{ isOver: boolean; canDrop: boolean }
	>({
		accept: TAB_DND_TYPE,
		drop: (item) => {
			if (tabToRender && item.tabId !== tabToRender.id) {
				dragTabToTab(item.tabId, tabToRender.id);
			}
		},
		canDrop: (item) => {
			return tabToRender !== null && item.tabId !== tabToRender.id;
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
