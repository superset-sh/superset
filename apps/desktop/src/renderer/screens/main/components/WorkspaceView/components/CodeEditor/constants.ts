// "Apple SD Gothic Neo" lets macOS shape NFD-normalized Hangul (jamo decomposed
// into U+11xx) correctly via AAT — without it, Latin-only monospace fonts like
// Menlo leak each jamo to a separate fallback glyph and the syllable breaks
// apart. "Malgun Gothic" mirrors the same role on Windows.
const CJK_FONT_FALLBACK = '"Apple SD Gothic Neo", "Malgun Gothic"';

export const DEFAULT_CODE_EDITOR_FONT_FAMILY = `ui-monospace, Menlo, Consolas, ${CJK_FONT_FALLBACK}, Liberation Mono, monospace`;
export const DEFAULT_CODE_EDITOR_FONT_SIZE = 13;

/**
 * Append CJK fallback to a user-provided font stack so NFD Hangul still shapes
 * correctly. Skipped when the stack already references a Korean fallback.
 */
export function withCjkFallback(fontFamily: string | undefined): string {
	if (!fontFamily) return DEFAULT_CODE_EDITOR_FONT_FAMILY;
	const lower = fontFamily.toLowerCase();
	if (lower.includes("apple sd gothic") || lower.includes("malgun gothic")) {
		return fontFamily;
	}
	return `${fontFamily}, ${CJK_FONT_FALLBACK}, monospace`;
}
