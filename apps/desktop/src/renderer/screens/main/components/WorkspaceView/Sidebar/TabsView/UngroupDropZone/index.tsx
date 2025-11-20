import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useDrop } from "react-dnd";
import { useTabs, useUngroupTab } from "renderer/stores";
import type { Tab } from "renderer/stores/tabs/types";
import { type DragItem, TAB_DND_TYPE } from "../TabItem/types";

interface UngroupDropZoneProps {
	children: (
		draggedTab: Tab | null,
		isDragOver: boolean,
		dropIndex: number,
	) => ReactNode;
}

export function UngroupDropZone({ children }: UngroupDropZoneProps) {
	const ungroupTab = useUngroupTab();
	const tabs = useTabs();
	const containerRef = useRef<HTMLDivElement>(null);
	const [dropIndex, setDropIndex] = useState(0);

	const [{ isOver, canDrop, draggedTab }, drop] = useDrop<
		DragItem,
		void,
		{ isOver: boolean; canDrop: boolean; draggedTab: Tab | null }
	>({
		accept: TAB_DND_TYPE,
		drop: (item, monitor) => {
			// Only ungroup if not dropped on a tab (which would be handled by the tab's own drop handler)
			const didDrop = monitor.didDrop();
			if (!didDrop) {
				const draggedTab = tabs.find((t) => t.id === item.tabId);
				// Only ungroup if the tab has a parent (is part of a group)
				if (draggedTab?.parentId) {
					ungroupTab(item.tabId, dropIndex);
				}
			}
		},
		hover: (_item, monitor) => {
			if (!containerRef.current) return;

			const clientOffset = monitor.getClientOffset();
			if (!clientOffset) return;

			const containerRect = containerRef.current.getBoundingClientRect();
			const hoverY = clientOffset.y - containerRect.top;

			// Get all tab elements
			const tabElements =
				containerRef.current.querySelectorAll("[data-tab-item]");
			let newDropIndex = 0;

			for (let i = 0; i < tabElements.length; i++) {
				const element = tabElements[i] as HTMLElement;
				const rect = element.getBoundingClientRect();
				const elementY = rect.top - containerRect.top;
				const elementMiddle = elementY + rect.height / 2;

				if (hoverY < elementMiddle) {
					newDropIndex = i;
					break;
				}
				newDropIndex = i + 1;
			}

			setDropIndex(newDropIndex);
		},
		collect: (monitor) => {
			const item = monitor.getItem() as DragItem | null;
			const draggedTab = item ? tabs.find((t) => t.id === item.tabId) : null;
			const hasParent = draggedTab?.parentId !== undefined;

			return {
				isOver: monitor.isOver({ shallow: true }),
				canDrop: monitor.canDrop() && hasParent,
				draggedTab: draggedTab || null,
			};
		},
	});

	const isDragOver = isOver && canDrop;

	return (
		<div
			ref={(node) => {
				containerRef.current = node;
				drop(node);
			}}
			className="flex-1 overflow-auto"
		>
			{children(isDragOver ? draggedTab : null, isDragOver, dropIndex)}
		</div>
	);
}
