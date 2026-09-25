import type {
	CommentAnchor,
	FrameRect,
} from "@superset/shared/page-comments-runtime";

/** Diameter of a pin, and the gap between two pins stacked on one spot. */
export const PIN_SIZE = 24;
export const STACK_OFFSET = 20;

export interface PinPoint {
	x: number;
	y: number;
}

/**
 * Where a thread's pin sits inside its element, in frame coordinates.
 *
 * An anchor without offsets predates click-point pins, so it keeps the old
 * top-left placement rather than jumping somewhere new on upgrade.
 */
export function pinPointOf(rect: FrameRect, anchor: CommentAnchor): PinPoint {
	const { offsetX, offsetY } = anchor;
	if (offsetX === undefined || offsetY === undefined) {
		return { x: rect.left, y: rect.top + PIN_SIZE };
	}
	return {
		x: rect.left + insetStart(offsetX * rect.width, rect.width),
		y: rect.top + insetEnd(offsetY * rect.height, rect.height),
	};
}

/**
 * Where the pin's box goes for an anchor point. The pin is round except for
 * its bottom-left corner, so that corner is the tip: it rests on the point and
 * the body sits up and to the right, off the words it marks rather than over
 * them.
 */
export function pinTransform(point: PinPoint, stackIndex = 0): string {
	return `translate(${point.x + stackIndex * STACK_OFFSET}px, ${point.y - PIN_SIZE}px)`;
}

/**
 * Keep the pin's box inside the element it belongs to. The box starts at the
 * point on x and ends at it on y, so the two axes clamp to opposite edges. A
 * target smaller than the pin has no room, so the pin rests on that edge and
 * overhangs rather than being pushed off the frame and clipped.
 */
function insetStart(offset: number, extent: number): number {
	if (extent <= PIN_SIZE) return 0;
	return Math.min(Math.max(offset, 0), extent - PIN_SIZE);
}

function insetEnd(offset: number, extent: number): number {
	if (extent <= PIN_SIZE) return PIN_SIZE;
	return Math.min(Math.max(offset, PIN_SIZE), extent);
}

/**
 * Fans pins out along a row when they land on top of each other, so two
 * readers commenting on the same spot both stay clickable. Pins far enough
 * apart keep their exact click point and get index 0.
 */
export function stackPins(
	pins: { id: string; point: PinPoint }[],
): Record<string, number> {
	const placed: PinPoint[] = [];
	const indexes: Record<string, number> = {};

	for (const pin of pins) {
		let index = 0;
		while (placed.some((taken) => collides(taken, shift(pin.point, index)))) {
			index += 1;
		}
		indexes[pin.id] = index;
		placed.push(shift(pin.point, index));
	}

	return indexes;
}

function shift(point: PinPoint, index: number): PinPoint {
	return { x: point.x + index * STACK_OFFSET, y: point.y };
}

function collides(a: PinPoint, b: PinPoint): boolean {
	return Math.abs(a.x - b.x) < STACK_OFFSET && Math.abs(a.y - b.y) < PIN_SIZE;
}
