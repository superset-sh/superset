import { useEffect, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import type { ChangeCategory } from "shared/changes-types";

const CHANGES_SECTION_DND_TYPE = "CHANGES_SECTION";

interface ChangesSectionDragItem {
	draggedId: ChangeCategory;
}

interface UseChangesSectionDndInput {
	id: ChangeCategory;
	onMove?: (fromSection: ChangeCategory, toSection: ChangeCategory) => void;
}

export function useChangesSectionDnd<T extends HTMLElement = HTMLDivElement>({
	id,
	onMove,
}: UseChangesSectionDndInput) {
	const containerRef = useRef<T | null>(null);

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: CHANGES_SECTION_DND_TYPE,
			item: { draggedId: id },
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[id],
	);

	const [{ isOver }, drop] = useDrop(
		() => ({
			accept: CHANGES_SECTION_DND_TYPE,
			drop: (item: ChangesSectionDragItem) => {
				if (item.draggedId === id) return;
				onMove?.(item.draggedId, id);
			},
			collect: (monitor) => ({
				isOver: monitor.isOver({ shallow: true }),
			}),
		}),
		[id, onMove],
	);

	useEffect(() => {
		drag(drop(containerRef));
	}, [drag, drop]);

	return {
		containerRef,
		isDragging,
		isOver,
	};
}
