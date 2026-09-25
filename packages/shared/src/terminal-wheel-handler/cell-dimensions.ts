import type { Terminal as XTerm } from "@xterm/xterm";

export interface CellDimensions {
	width: number;
	height: number;
}

/**
 * Read the rendered cell size in CSS pixels.
 *
 * xterm.js does not expose a public API for cell dimensions, so this reads
 * internal _core._renderService.dimensions. Returns null when the renderer
 * has not measured yet (terminal not opened / hidden) or if the internal
 * shape changes in a future xterm.js version.
 */
export function getCellDimensions(xterm: XTerm): CellDimensions | null {
	const dimensions = (
		xterm as unknown as {
			_core?: {
				_renderService?: {
					dimensions?: { css: { cell: { width: number; height: number } } };
				};
			};
		}
	)._core?._renderService?.dimensions;
	if (!dimensions?.css?.cell) return null;

	const { width, height } = dimensions.css.cell;
	if (width <= 0 || height <= 0) return null;

	return { width, height };
}
