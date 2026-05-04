import type { Terminal as XTerm } from "@xterm/xterm";

export interface ClickToMoveOptions {
	/** Callback to write data to the terminal PTY */
	onWrite: (data: string) => void;
}

/**
 * Convert mouse event coordinates to terminal cell coordinates.
 * Returns null if coordinates cannot be determined.
 */
function getTerminalCoordsFromEvent(
	xterm: XTerm,
	event: MouseEvent,
): { col: number; row: number } | null {
	const element = xterm.element;
	if (!element) return null;

	const rect = element.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const y = event.clientY - rect.top;

	// Note: xterm.js does not expose a public API for mouse-to-coords conversion,
	// so we must access internal _core._renderService.dimensions. This is fragile
	// and may break in future xterm.js versions.
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

	const cellWidth = dimensions.css.cell.width;
	const cellHeight = dimensions.css.cell.height;

	if (cellWidth <= 0 || cellHeight <= 0) return null;

	// Clamp to valid terminal grid range to prevent excessive delta calculations
	const col = Math.max(0, Math.min(xterm.cols - 1, Math.floor(x / cellWidth)));
	const row = Math.max(0, Math.min(xterm.rows - 1, Math.floor(y / cellHeight)));

	return { col, row };
}

/**
 * If a TUI app enabled DEC mouse-tracking (mode ?1000h, ?1002h, ?1003h, etc.),
 * xterm forwards clicks as CSI mouse reports rather than treating them as
 * selection — moving the cursor with arrow keys would be wrong in that mode.
 * Bail out so we don't double-handle the click.
 */
function isMouseTrackingActive(xterm: XTerm): boolean {
	const mode = (xterm as unknown as { modes?: { mouseTrackingMode?: string } })
		.modes?.mouseTrackingMode;
	return typeof mode === "string" && mode !== "none";
}

/**
 * Setup click-to-move cursor functionality.
 * Allows clicking on the current prompt line to move the cursor to that position.
 *
 * This works by calculating the difference between click position and cursor position,
 * then sending the appropriate number of arrow key sequences to move the cursor.
 *
 * Limitations:
 * - Only works on the current line (same row as cursor)
 * - Only works at the shell prompt (not in full-screen apps like vim)
 * - Requires the shell to interpret arrow key sequences (bash/zsh/fish emacs mode)
 *
 * Returns a cleanup function to remove the handler.
 */
export function setupClickToMoveCursor(
	xterm: XTerm,
	options: ClickToMoveOptions,
): () => void {
	const handleClick = (event: MouseEvent) => {
		// Don't interfere with full-screen apps (vim, less, etc. use alternate buffer)
		if (xterm.buffer.active !== xterm.buffer.normal) return;
		// Don't interfere with TUI apps that consume mouse events themselves.
		if (isMouseTrackingActive(xterm)) return;
		if (event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
			return;
		if (xterm.hasSelection()) return;

		const coords = getTerminalCoordsFromEvent(xterm, event);
		if (!coords) return;

		const buffer = xterm.buffer.active;
		const clickBufferRow = coords.row + buffer.viewportY;

		// Only move cursor on the same line (editable prompt area)
		if (clickBufferRow !== buffer.cursorY + buffer.viewportY) return;

		const delta = coords.col - buffer.cursorX;
		if (delta === 0) return;

		// Right arrow: \x1b[C, Left arrow: \x1b[D
		const arrowKey = delta > 0 ? "\x1b[C" : "\x1b[D";
		options.onWrite(arrowKey.repeat(Math.abs(delta)));
	};

	xterm.element?.addEventListener("click", handleClick);

	return () => {
		xterm.element?.removeEventListener("click", handleClick);
	};
}
