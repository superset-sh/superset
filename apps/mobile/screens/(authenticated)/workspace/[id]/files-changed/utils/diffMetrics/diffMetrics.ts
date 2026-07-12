export const DIFF_FONT_SIZE = 13;
export const DIFF_LINE_HEIGHT = 20;
export const GUTTER_WIDTH = 48;
export const SIGN_WIDTH = 18;
export const CODE_PADDING_RIGHT = 16;

/** Monospace advance estimate until the probe measures the real value. */
export const ESTIMATED_CHAR_WIDTH = DIFF_FONT_SIZE * 0.6;

export function contentWidthForChars(
	maxLineChars: number,
	charWidth: number,
): number {
	return Math.ceil(maxLineChars * charWidth) + CODE_PADDING_RIGHT;
}
