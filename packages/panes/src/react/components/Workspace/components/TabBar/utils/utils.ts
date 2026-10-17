export const TAB_WIDTH = 160;

const WHEEL_DELTA_MODE_LINE = 1;
const LINE_SCROLL_PX = 16;

interface WheelDelta {
	deltaX: number;
	deltaY: number;
	deltaMode: number;
}

// A vertical mouse wheel can't scroll the strip natively (overflow-y is
// hidden), so translate it to horizontal. Horizontal input (trackpads)
// scrolls natively and must not be doubled.
export function wheelScrollDelta({
	deltaX,
	deltaY,
	deltaMode,
}: WheelDelta): number {
	if (Math.abs(deltaX) >= Math.abs(deltaY)) return 0;
	return deltaMode === WHEEL_DELTA_MODE_LINE ? deltaY * LINE_SCROLL_PX : deltaY;
}

export function computeInsertIndex(
	clientX: number,
	trackRect: DOMRect,
	tabCount: number,
): number {
	const x = clientX - trackRect.left;
	const tabIndex = Math.floor(x / TAB_WIDTH);
	const withinTab = x % TAB_WIDTH;

	// Past all tabs → insert at end
	if (tabIndex >= tabCount) return tabCount;

	// Left half → insert before this tab, right half → insert after
	return withinTab > TAB_WIDTH / 2 ? tabIndex + 1 : tabIndex;
}
