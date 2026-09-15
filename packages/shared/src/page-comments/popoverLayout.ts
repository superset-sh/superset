const WIDTH = 350;
const GAP = 10;
const EDGE = 12;
/**
 * Below this the card stops being usable — avatar, author, timestamp and the
 * composer's send control no longer fit on their rows — so a container this
 * narrow gets an overflowing card rather than an unreadable one.
 */
const MIN_WIDTH = 240;

const DEFAULT_PIN_SIZE = 24;

export interface PopoverPoint {
	x: number;
	y: number;
}

export interface PopoverPlacement {
	left: number;
	top: number;
	width: number;
}

export function popoverPlacement({
	point,
	container,
	height,
	pinSize = DEFAULT_PIN_SIZE,
	maxWidth = WIDTH,
}: {
	point: PopoverPoint;
	container: { width: number; height: number };
	height: number;
	pinSize?: number;
	/** Narrow containers pass their own width: capping a phone at 350 leaves
	 * uneven margins once `left` is clamped against the right edge. */
	maxWidth?: number;
}): PopoverPlacement {
	const width = Math.max(
		MIN_WIDTH,
		Math.min(maxWidth, container.width - EDGE * 2),
	);
	// The pin's box hangs up and to the right of its point: it spans
	// [point.y - pinSize, point.y] vertically and starts at point.x.
	const belowTop = point.y + GAP;
	const top =
		belowTop + height + EDGE <= container.height
			? belowTop
			: Math.max(EDGE, point.y - pinSize - GAP - height);
	const left = Math.min(
		Math.max(EDGE, point.x),
		Math.max(EDGE, container.width - width - EDGE),
	);
	return { left, top, width };
}
