const COMBINING_MARK_REGEX = /\p{Mark}/u;

/**
 * Mirrors xterm's cell width behavior for common cases:
 * - CJK/full-width chars occupy 2 cells
 * - combining marks occupy 0 cells
 * - control chars occupy 0 cells
 */
function getCodePointCellWidth(char: string, codePoint: number): number {
	if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
		return 0;
	}

	if (COMBINING_MARK_REGEX.test(char)) {
		return 0;
	}

	if (isFullWidthCodePoint(codePoint)) {
		return 2;
	}

	return 1;
}

// Adapted from the de-facto fullwidth detection used by string-width/is-fullwidth-code-point.
function isFullWidthCodePoint(codePoint: number): boolean {
	return (
		codePoint >= 0x1100 &&
		(codePoint <= 0x115f || // Hangul Jamo
			codePoint === 0x2329 ||
			codePoint === 0x232a ||
			// CJK Radicals Supplement .. Yi Radicals
			(codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
			// Hangul Jamo Extended-A
			(codePoint >= 0xa960 && codePoint <= 0xa97c) ||
			// Hangul Syllables
			(codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
			// CJK Compatibility Ideographs
			(codePoint >= 0xf900 && codePoint <= 0xfaff) ||
			// Vertical forms
			(codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
			// CJK Compatibility Forms .. Small Form Variants
			(codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
			// Fullwidth Forms
			(codePoint >= 0xff00 && codePoint <= 0xff60) ||
			(codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
			// Kana Supplement .. Enclosed Ideographic Supplement
			(codePoint >= 0x1b000 && codePoint <= 0x1f251) ||
			// CJK Unified Ideographs Extension B..Tertiary Ideographic Plane
			(codePoint >= 0x20000 && codePoint <= 0x3fffd))
	);
}

export function getCellWidthForText(text: string): number {
	return getCellWidthUpToIndex(text, text.length);
}

export function getCellWidthUpToIndex(text: string, utf16Index: number): number {
	if (!text || utf16Index <= 0) {
		return 0;
	}

	const end = Math.min(utf16Index, text.length);
	let width = 0;
	let i = 0;

	while (i < end) {
		const codePoint = text.codePointAt(i);
		if (codePoint === undefined) {
			break;
		}

		const char = String.fromCodePoint(codePoint);
		width += getCodePointCellWidth(char, codePoint);
		i += codePoint > 0xffff ? 2 : 1;
	}

	return width;
}
