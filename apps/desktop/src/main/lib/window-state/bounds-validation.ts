import type { Rectangle } from "electron";
import { screen } from "electron";
import type { WindowState } from "./window-state";

const MIN_VISIBLE_OVERLAP = 50;
const MIN_WINDOW_SIZE = 400;

/**
 * Checks if bounds overlap at least MIN_VISIBLE_OVERLAP pixels with any display.
 * Returns false if window would be completely off-screen (e.g., monitor disconnected).
 */
export function isVisibleOnAnyDisplay(bounds: Rectangle): boolean {
	const displays = screen.getAllDisplays();

	return displays.some((display) => {
		const db = display.bounds;
		return (
			bounds.x < db.x + db.width - MIN_VISIBLE_OVERLAP &&
			bounds.x + bounds.width > db.x + MIN_VISIBLE_OVERLAP &&
			bounds.y < db.y + db.height - MIN_VISIBLE_OVERLAP &&
			bounds.y + bounds.height > db.y + MIN_VISIBLE_OVERLAP
		);
	});
}

/**
 * Clamps dimensions to not exceed the primary display work area.
 * Handles DPI/resolution changes since last save.
 */
function clampToWorkArea(
	width: number,
	height: number,
): { width: number; height: number } {
	const { workAreaSize } = screen.getPrimaryDisplay();
	return {
		width: Math.min(Math.max(width, MIN_WINDOW_SIZE), workAreaSize.width),
		height: Math.min(Math.max(height, MIN_WINDOW_SIZE), workAreaSize.height),
	};
}

export interface InitialWindowBounds {
	x?: number;
	y?: number;
	width: number;
	height: number;
	center: boolean;
	isMaximized: boolean;
}

/**
 * Computes initial window bounds from saved state, with fallbacks.
 *
 * - No saved state → default to primary display size, centered
 * - Saved position visible → restore exactly
 * - Saved position not visible (monitor disconnected) → use saved size, but center
 */
export function getInitialWindowBounds(
	savedState: WindowState | null,
): InitialWindowBounds {
	const { workAreaSize } = screen.getPrimaryDisplay();

	// No saved state → default to primary display size, centered
	if (!savedState) {
		return {
			width: workAreaSize.width,
			height: workAreaSize.height,
			center: true,
			isMaximized: false,
		};
	}

	const { width, height } = clampToWorkArea(
		savedState.width,
		savedState.height,
	);

	const savedBounds: Rectangle = {
		x: savedState.x,
		y: savedState.y,
		width,
		height,
	};

	// Saved position visible on a connected display → restore exactly
	if (isVisibleOnAnyDisplay(savedBounds)) {
		return {
			x: savedState.x,
			y: savedState.y,
			width,
			height,
			center: false,
			isMaximized: savedState.isMaximized,
		};
	}

	// Position not visible (monitor disconnected) → use saved size, but center
	return {
		width,
		height,
		center: true,
		isMaximized: savedState.isMaximized,
	};
}
