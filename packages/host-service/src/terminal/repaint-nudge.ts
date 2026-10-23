/**
 * Temporary PTY size for a repaint nudge. One column and one row smaller
 * than the live size, when that still fits in the PTY.
 *
 * The on-screen terminal stays at the live size for the whole nudge. A
 * larger intermediate frame wraps there, and the restore then erases from
 * the wrong cursor. A smaller frame does not wrap. cursor-agent's Ink
 * renderer also forces a write when the width shrinks; restoring the live
 * size writes again because that layout is different.
 */
export function repaintNudgeIntermediateSize(
	cols: number,
	rows: number,
): { cols: number; rows: number } {
	return {
		cols: cols > 1 ? cols - 1 : cols + 1,
		rows: rows > 1 ? rows - 1 : rows + 1,
	};
}
