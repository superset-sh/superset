import { FONT_SIZE_LIMITS } from "@superset/shared/settings-constraints";
import { DEFAULT_TERMINAL_FONT_SIZE } from "renderer/lib/terminal/appearance";

export type ZoomDirection = "in" | "out" | "reset";

const STEP = 1;

/**
 * Next persisted terminal font size for a zoom step, or `undefined` when the
 * press is a no-op (already at a limit). `null` means "clear the override"
 * (back to the default), which is what reset persists.
 */
export function stepTerminalFontSize(
	current: number | null,
	direction: ZoomDirection,
): number | null | undefined {
	if (direction === "reset") {
		return current === null ? undefined : null;
	}
	const size = current ?? DEFAULT_TERMINAL_FONT_SIZE;
	const next = Math.min(
		FONT_SIZE_LIMITS.max,
		Math.max(FONT_SIZE_LIMITS.min, size + (direction === "in" ? STEP : -STEP)),
	);
	return next === size ? undefined : next;
}
