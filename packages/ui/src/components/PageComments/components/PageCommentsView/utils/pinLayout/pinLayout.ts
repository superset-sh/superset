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
		return { x: rect.left, y: rect.top };
	}
	return {
		x: rect.left + inset(offsetX * rect.width, rect.width),
		y: rect.top + inset(offsetY * rect.height, rect.height),
	};
}

/**
 * Keeps a pin from hanging off the element it belongs to. A target thinner
 * than the pin itself has no room to inset, so the pin centres on it instead.
 */
function inset(offset: number, extent: number): number {
	if (extent <= PIN_SIZE) return extent / 2;
	return Math.min(Math.max(offset, PIN_SIZE / 2), extent - PIN_SIZE / 2);
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
