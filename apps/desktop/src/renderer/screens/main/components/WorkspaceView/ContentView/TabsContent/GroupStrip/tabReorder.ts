export interface HoverReorderArgs {
	/** Index of the tab currently being dragged (its live position). */
	dragIndex: number;
	/** Index of the tab being hovered over. */
	hoverIndex: number;
	/** Horizontal pointer position in client coordinates. */
	pointerX: number;
	/** Bounding box of the hovered tab in client coordinates. */
	boundingRect: { left: number; right: number };
}

/**
 * Decide whether a hovered tab should swap positions with the dragged tab.
 *
 * react-dnd fires `hover` on every pointer move while a drag is in progress.
 * Swapping the instant the pointer crosses a neighbour's edge (the previous
 * behaviour) makes the dragged tab slide under the pointer, so the very next
 * move swaps it straight back — the tabs oscillate and reordering feels
 * impossible. Only committing the swap once the pointer passes the neighbour's
 * horizontal midpoint, in the direction of travel, keeps reordering stable.
 */
export function shouldReorderOnHover({
	dragIndex,
	hoverIndex,
	pointerX,
	boundingRect,
}: HoverReorderArgs): boolean {
	if (dragIndex === hoverIndex) return false;

	const hoverMiddleX = (boundingRect.right - boundingRect.left) / 2;
	const hoverClientX = pointerX - boundingRect.left;

	// Dragging rightwards: only swap once the pointer is past the midpoint.
	if (dragIndex < hoverIndex && hoverClientX < hoverMiddleX) return false;
	// Dragging leftwards: only swap once the pointer is past the midpoint.
	if (dragIndex > hoverIndex && hoverClientX > hoverMiddleX) return false;

	return true;
}
