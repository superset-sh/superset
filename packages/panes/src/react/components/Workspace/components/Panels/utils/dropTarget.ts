import type { SplitPosition } from "../../../../../../types";

export type PanelDropTarget = SplitPosition | "center";

interface RectLike {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

/** Split bands are at most this thick, so large panels are mostly "center" */
const MAX_EDGE_BAND_PX = 100;

/**
 * Classify a hover into a VS Code-style drop zone. Dropping a tab directly
 * over a panel combines it into that panel's tab group ("center"); only the
 * outer bands split. Bands are 20% of the panel capped at a fixed pixel
 * size — proportional bands made tall/wide panels split when the user
 * clearly dropped "on" the panel (e.g. just below its tab bar).
 */
export function getDropTarget(
	clientX: number,
	clientY: number,
	rect: RectLike,
): PanelDropTarget {
	const bandX = Math.min(rect.width * 0.2, MAX_EDGE_BAND_PX);
	const bandY = Math.min(rect.height * 0.2, MAX_EDGE_BAND_PX);

	const fromLeft = clientX - rect.left;
	const fromRight = rect.right - clientX;
	const fromTop = clientY - rect.top;
	const fromBottom = rect.bottom - clientY;

	if (
		fromLeft > bandX &&
		fromRight > bandX &&
		fromTop > bandY &&
		fromBottom > bandY
	) {
		return "center";
	}

	// In a band (or a corner): pick the edge the pointer is closest to,
	// normalized by band thickness so corners resolve sensibly.
	const candidates: Array<[PanelDropTarget, number]> = [
		["left", fromLeft / bandX],
		["right", fromRight / bandX],
		["top", fromTop / bandY],
		["bottom", fromBottom / bandY],
	];
	candidates.sort((a, b) => a[1] - b[1]);
	return (candidates[0] as [PanelDropTarget, number])[0];
}
