const WIDTH = 350;
const GAP = 10;
const EDGE = 12;
/**
 * Below this the card stops being usable — avatar, author, timestamp and the
 * composer's send control no longer fit on their rows — so a container this
 * narrow gets an overflowing card rather than an unreadable one.
 */
const MIN_WIDTH = 240;

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
	pinSize,
	maxWidth = WIDTH,
}: {
	point: PopoverPoint;
	container: { width: number; height: number };
	height: number;
	pinSize: number;
	maxWidth?: number;
}): PopoverPlacement {
	const width = Math.max(
		MIN_WIDTH,
		Math.min(maxWidth, container.width - EDGE * 2),
	);
	// The pin's box hangs up and to the right of its point: it spans
	// [point.y - pinSize, point.y] vertically and starts at point.x.
	const belowTop = point.y + GAP;
	const desiredTop =
		belowTop + height + EDGE <= container.height
			? belowTop
			: point.y - pinSize - GAP - height;
	const top = Math.max(
		EDGE,
		Math.min(desiredTop, container.height - height - EDGE),
	);
	const left = Math.min(
		Math.max(EDGE, point.x),
		Math.max(EDGE, container.width - width - EDGE),
	);
	return { left, top, width };
}
