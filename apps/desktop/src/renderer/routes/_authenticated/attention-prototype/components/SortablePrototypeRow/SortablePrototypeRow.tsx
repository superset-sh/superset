import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

interface SortablePrototypeRowProps {
	id: string;
	/** Real sidebar disables dragging the local main workspace. */
	dragDisabled?: boolean;
	/**
	 * While a drag is active, rows outside the dragged row's group disable their
	 * droppable so closestCenter never targets them — other groups' rows don't
	 * shift and the drop stays clamped inside the source group.
	 */
	droppableDisabled?: boolean;
	children: ReactNode;
}

/**
 * dnd-kit wrapper for a prototype row — copy of the real sidebar's
 * SortableWorkspaceItem. A plain outer div takes the dnd translate so it never
 * fights framer-motion's transform management on the inner motion element.
 */
export function SortablePrototypeRow({
	id,
	dragDisabled = false,
	droppableDisabled = false,
	children,
}: SortablePrototypeRowProps) {
	const {
		setNodeRef,
		attributes,
		listeners,
		isDragging,
		transform,
		transition,
	} = useSortable({
		id,
		disabled: { draggable: dragDisabled, droppable: droppableDisabled },
	});

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : undefined,
			}}
			{...attributes}
			{...listeners}
		>
			{children}
		</div>
	);
}
