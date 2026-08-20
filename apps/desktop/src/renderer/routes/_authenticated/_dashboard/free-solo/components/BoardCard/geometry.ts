export interface DragOrigin {
	x: number;
	y: number;
	pointerX: number;
	pointerY: number;
}

export interface PointerPosition {
	pointerX: number;
	pointerY: number;
}

/** Card position for a pointer move, clamped to the board's top-left. */
export function dragPosition(
	origin: DragOrigin,
	pointer: PointerPosition,
): { x: number; y: number } {
	return {
		x: Math.max(0, origin.x + (pointer.pointerX - origin.pointerX)),
		y: Math.max(0, origin.y + (pointer.pointerY - origin.pointerY)),
	};
}
