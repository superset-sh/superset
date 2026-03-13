import { describe, expect, it } from "bun:test";
import { DEFAULT_TERMINAL_FONT_FAMILY, TERMINAL_OPTIONS } from "./config";

/**
 * Regression tests for issue #2231:
 * Underline decoration misaligned with CJK/mixed-width text in terminal.
 *
 * Root cause: The font fallback chain did not include any CJK-optimized
 * monospace fonts. CJK characters fell through to system fallbacks whose
 * glyph widths may differ from 2× the primary font's cell width, causing
 * xterm.js underline decorations to drift from the actual glyph positions.
 *
 * Fix: Add known CJK monospace fonts to the fallback chain so that browsers
 * use a font whose CJK glyph width is exactly 2 cells wide.
 */
describe("DEFAULT_TERMINAL_FONT_FAMILY - CJK support (issue #2231)", () => {
	it("includes at least one CJK-optimized monospace font", () => {
		const fonts = DEFAULT_TERMINAL_FONT_FAMILY.toLowerCase();

		// Any of these fonts guarantees correct 2-cell wide CJK glyphs
		const cjkFonts = [
			"sarasa mono",
			"noto sans mono cjk",
			"source han mono",
			"courier prime",
			"unifont",
		];

		const hasCjkFont = cjkFonts.some((font) => fonts.includes(font));

		expect(hasCjkFont).toBe(true);
	});

	it("places CJK fonts after primary Latin/Nerd fonts in the fallback chain", () => {
		const fonts = DEFAULT_TERMINAL_FONT_FAMILY.toLowerCase();

		// Primary Nerd Font should still come first
		const nerdFontIndex = fonts.indexOf("meslo");
		expect(nerdFontIndex).toBeGreaterThanOrEqual(0);

		// CJK font should appear somewhere after the primary fonts
		const sarasaIndex = fonts.indexOf("sarasa mono");
		const notoIndex = fonts.indexOf("noto sans mono cjk");
		const cjkIndex = Math.max(sarasaIndex, notoIndex);

		// At least one CJK font must be present and come after primary fonts
		expect(cjkIndex).toBeGreaterThan(nerdFontIndex);
	});

	it("TERMINAL_OPTIONS.fontFamily is the CJK-aware font family string", () => {
		expect(TERMINAL_OPTIONS.fontFamily).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
	});
});
