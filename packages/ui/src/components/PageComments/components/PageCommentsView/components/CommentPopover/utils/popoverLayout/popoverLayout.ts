import { PIN_SIZE, type PinPoint } from "../../../../utils/pinLayout";

const WIDTH = 350;
const GAP = 10;
const EDGE = 12;
/**
 * Below this the card stops being usable — avatar, author, timestamp and the
 * composer's send control no longer fit on their rows — so a container this
 * narrow gets an overflowing card rather than an unreadable one.
 */
const MIN_WIDTH = 240;

export interface PopoverPlacement {
	left: number;
	top: number;
	width: number;
}

export function popoverPlacement({
	point,
	container,
	height,
}: {
	point: PinPoint;
	container: { width: number; height: number };
	height: number;
}): PopoverPlacement {
	const width = Math.max(
		MIN_WIDTH,
		Math.min(WIDTH, container.width - EDGE * 2),
	);
	const belowTop = point.y + PIN_SIZE / 2 + GAP;
	const top =
		belowTop + height + EDGE <= container.height
			? belowTop
			: Math.max(EDGE, point.y - PIN_SIZE / 2 - GAP - height);
	const left = Math.min(
		Math.max(EDGE, point.x - PIN_SIZE / 2),
		Math.max(EDGE, container.width - width - EDGE),
	);
	return { left, top, width };
}
