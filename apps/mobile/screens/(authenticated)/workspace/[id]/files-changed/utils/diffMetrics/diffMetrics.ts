export const DIFF_FONT_SIZE = 14;
export const DIFF_LINE_HEIGHT = 21;
export const GUTTER_WIDTH = 52;
export const SIGN_WIDTH = 18;
export const CODE_PADDING_RIGHT = 16;

// Deterministic row heights — the virtualizer gets exact sizes so nothing
// shifts as content renders in.
export const HUNK_ROW_HEIGHT = 28;
export const EXPANDER_ROW_HEIGHT = 38;
export const FILE_HEADER_HEIGHT = 48;
export const NOTE_ROW_HEIGHT = 48;

/** Monospace advance estimate until the probe measures the real value. */
export const ESTIMATED_CHAR_WIDTH = DIFF_FONT_SIZE * 0.6;

export function contentWidthForChars(
	maxLineChars: number,
	charWidth: number,
): number {
	return Math.ceil(maxLineChars * charWidth) + CODE_PADDING_RIGHT;
}
