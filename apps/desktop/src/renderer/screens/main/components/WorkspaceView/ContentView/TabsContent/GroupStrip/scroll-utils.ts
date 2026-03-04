/**
 * Calculates the scroll-left offset needed to bring a tab into view within
 * a horizontally-scrollable container.
 *
 * Returns the required scrollLeft value, or null if the tab is already
 * fully visible and no scrolling is needed.
 */
export function getScrollOffsetForTab({
	tabIndex,
	tabWidth,
	containerScrollLeft,
	containerClientWidth,
}: {
	tabIndex: number;
	tabWidth: number;
	containerScrollLeft: number;
	containerClientWidth: number;
}): number | null {
	const tabLeft = tabIndex * tabWidth;
	const tabRight = tabLeft + tabWidth;
	const containerRight = containerScrollLeft + containerClientWidth;

	// Fully visible — no scrolling needed
	if (tabLeft >= containerScrollLeft && tabRight <= containerRight) {
		return null;
	}

	// Tab is to the left of the visible area — scroll so its left edge aligns
	if (tabLeft < containerScrollLeft) {
		return tabLeft;
	}

	// Tab is to the right of the visible area — scroll so its right edge aligns
	return tabRight - containerClientWidth;
}
