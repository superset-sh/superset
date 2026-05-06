export const TAB_WIDTH = 160;

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
