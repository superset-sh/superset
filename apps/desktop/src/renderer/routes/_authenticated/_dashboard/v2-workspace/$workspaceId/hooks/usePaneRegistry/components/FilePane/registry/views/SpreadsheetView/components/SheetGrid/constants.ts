import { ROW_HEIGHT } from "../../utils/gridGeometry";

export const HEADER_SURFACE =
	"bg-[color-mix(in_oklab,var(--foreground)_4%,color-mix(in_oklab,var(--muted)_60%,var(--background)))]";
export const HEADER_SURFACE_SELECTED =
	"bg-[color-mix(in_oklab,var(--primary)_14%,var(--background))]";

// Grid lines are painted once by the layer, not as a border on every cell:
// hundreds of cell borders made each scroll frame several times slower.
export const ROW_LINES = `repeating-linear-gradient(to bottom, transparent 0 ${ROW_HEIGHT - 1}px, var(--border) ${ROW_HEIGHT - 1}px ${ROW_HEIGHT}px)`;
