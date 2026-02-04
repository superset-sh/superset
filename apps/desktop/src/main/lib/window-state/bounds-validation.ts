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
 * - No saved state → maximize on primary display
 * - Saved position visible → restore exactly
 * - Saved position not visible (monitor disconnected) → use saved size, but center
 * - Saved size is much smaller than current display → scale up proportionally
 */
export function getInitialWindowBounds(
	savedState: WindowState | null,
): InitialWindowBounds {
	const { workAreaSize } = screen.getPrimaryDisplay();

	// No saved state → maximize by default for best first-launch experience
	if (!savedState) {
		return {
			width: workAreaSize.width,
			height: workAreaSize.height,
			center: true,
			isMaximized: true,
		};
	}

	let { width, height } = clampToWorkArea(savedState.width, savedState.height);

	// Scale up if saved bounds are much smaller than current work area
	// This handles moving from a small screen to a large screen
	const areaRatio =
		(width * height) / (workAreaSize.width * workAreaSize.height);
	if (areaRatio < 0.6) {
		// Saved window covers less than 60% of current screen → scale up
		// Use 90% of work area while maintaining aspect ratio
		const savedAspect = width / height;
		const targetWidth = Math.round(workAreaSize.width * 0.9);
		const targetHeight = Math.round(targetWidth / savedAspect);

		if (targetHeight <= workAreaSize.height) {
			width = targetWidth;
			height = targetHeight;
		} else {
			height = Math.round(workAreaSize.height * 0.9);
			width = Math.round(height * savedAspect);
		}
	}

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
