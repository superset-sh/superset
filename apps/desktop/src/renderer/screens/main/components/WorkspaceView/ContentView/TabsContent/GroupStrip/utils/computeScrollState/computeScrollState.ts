export type ScrollMetrics = {
	scrollLeft: number;
	scrollWidth: number;
	clientWidth: number;
};

export type ScrollState = {
	hasOverflow: boolean;
	canScrollLeft: boolean;
	canScrollRight: boolean;
};

const BOUNDARY_TOLERANCE_PX = 1;

export function computeScrollState({
	scrollLeft,
	scrollWidth,
	clientWidth,
}: ScrollMetrics): ScrollState {
	const hasOverflow = scrollWidth > clientWidth + BOUNDARY_TOLERANCE_PX;
	if (!hasOverflow) {
		return { hasOverflow: false, canScrollLeft: false, canScrollRight: false };
	}
	const canScrollLeft = scrollLeft > BOUNDARY_TOLERANCE_PX;
	const canScrollRight =
		scrollLeft + clientWidth < scrollWidth - BOUNDARY_TOLERANCE_PX;
	return { hasOverflow, canScrollLeft, canScrollRight };
}
