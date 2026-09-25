import type {
	CommentAnchor,
	FrameRect,
} from "@superset/shared/page-comments-runtime";

export const PIN_SIZE = 28;
export const STACK_OFFSET = 24;

export interface PinPoint {
	x: number;
	y: number;
}

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

function inset(offset: number, extent: number): number {
	if (extent <= PIN_SIZE) return extent / 2;
	return Math.min(Math.max(offset, PIN_SIZE / 2), extent - PIN_SIZE / 2);
}

export function stackPins(
	pins: Array<{ id: string; point: PinPoint }>,
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
