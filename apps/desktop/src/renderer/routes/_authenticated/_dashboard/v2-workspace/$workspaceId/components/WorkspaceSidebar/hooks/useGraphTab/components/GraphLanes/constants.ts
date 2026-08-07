// Lane geometry. Every number is derived from the sidebar's real width range
// (240-560px) and the compact breakpoint in WorkspaceSidebar.tsx.
// See apps/desktop/plans/20260801-1200-git-graph-visual-spec.md.

export interface GraphGeometry {
	/** Horizontal distance between lane centres. */
	pitch: number;
	rowHeight: number;
	nodeRadius: number;
	elbowRadius: number;
	strokeWidth: number;
}

export const GRAPH_GEOMETRY: GraphGeometry = {
	pitch: 14,
	rowHeight: 28,
	nodeRadius: 3.5,
	elbowRadius: 6,
	strokeWidth: 1.5,
};

export const GRAPH_GEOMETRY_COMPACT: GraphGeometry = {
	pitch: 12,
	rowHeight: 24,
	nodeRadius: 3,
	elbowRadius: 5,
	strokeWidth: 1.5,
};

export function graphGeometry(compact: boolean): GraphGeometry {
	return compact ? GRAPH_GEOMETRY_COMPACT : GRAPH_GEOMETRY;
}

/**
 * Height of the badge line a two-line row adds above its subject. Matches the
 * badge's own box (h-4 / h-3.5) so the line costs nothing but the badges.
 */
export function refLineHeight(compact: boolean): number {
	return compact ? 14 : 16;
}

/**
 * The virtualizer's `estimateSize(i)`. Index-based, so a two-line row needs no
 * measurement pass: whether a row carries refs is known before render.
 */
export function graphRowHeight(options: {
	compact: boolean;
	twoLine: boolean;
}): number {
	const { compact, twoLine } = options;
	return (
		graphGeometry(compact).rowHeight + (twoLine ? refLineHeight(compact) : 0)
	);
}

/**
 * Visible lanes before the overflow chip takes over. Width-derived because the
 * lane column is the only element that can starve the subject: at 260px a
 * 6-lane column already costs 88px.
 */
export function laneCapForWidth(width: number): number {
	if (width < 260) return 4;
	return width >= 400 ? 8 : 6;
}

/** Author and date only earn their space at the wide breakpoint. */
export const GRAPH_WIDE_BREAKPOINT = 400;
