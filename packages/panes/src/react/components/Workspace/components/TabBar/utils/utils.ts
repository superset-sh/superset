export const TAB_WIDTH = 160;
export const TAB_WINDOWING_THRESHOLD = 12;
export const TAB_WINDOW_OVERSCAN = 4;

interface VisibleTabWindowInput {
	clientWidth: number;
	overscan?: number;
	scrollLeft: number;
	tabCount: number;
	windowingThreshold?: number;
}

export function getVisibleTabWindow({
	clientWidth,
	overscan = TAB_WINDOW_OVERSCAN,
	scrollLeft,
	tabCount,
	windowingThreshold = TAB_WINDOWING_THRESHOLD,
}: VisibleTabWindowInput): { end: number; start: number } {
	if (tabCount <= 0) {
		return { start: 0, end: 0 };
	}

	if (tabCount <= windowingThreshold) {
		return { start: 0, end: tabCount };
	}

	if (clientWidth <= 0) {
		return { start: 0, end: Math.min(tabCount, windowingThreshold) };
	}

	const boundedScrollLeft = Math.max(0, scrollLeft);
	const visibleStart = Math.floor(boundedScrollLeft / TAB_WIDTH);
	const visibleEnd = Math.ceil((boundedScrollLeft + clientWidth) / TAB_WIDTH);

	return {
		start: Math.max(0, visibleStart - overscan),
		end: Math.min(tabCount, visibleEnd + overscan),
	};
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
