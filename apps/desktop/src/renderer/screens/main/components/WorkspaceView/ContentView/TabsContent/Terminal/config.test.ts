import { describe, expect, test } from "bun:test";
import {
	DEFAULT_TERMINAL_FONT_FAMILY,
	EMOJI_FONT_FAMILIES,
	withEmojiFontFallback,
} from "./config";

describe("Terminal font config — emoji support (#2650)", () => {
	test("DEFAULT_TERMINAL_FONT_FAMILY includes emoji font fallbacks", () => {
		for (const emojiFont of EMOJI_FONT_FAMILIES) {
			expect(DEFAULT_TERMINAL_FONT_FAMILY).toContain(emojiFont);
		}
	});

	test("emoji fonts appear after monospace fonts in the default family", () => {
		const monospaceIdx = DEFAULT_TERMINAL_FONT_FAMILY.indexOf("monospace");
		for (const emojiFont of EMOJI_FONT_FAMILIES) {
			const emojiIdx = DEFAULT_TERMINAL_FONT_FAMILY.indexOf(emojiFont);
			expect(emojiIdx).toBeGreaterThan(monospaceIdx);
		}
	});

	describe("withEmojiFontFallback", () => {
		test("appends emoji fonts to a custom font family that lacks them", () => {
			const result = withEmojiFontFallback("JetBrains Mono, monospace");
			for (const emojiFont of EMOJI_FONT_FAMILIES) {
				expect(result).toContain(emojiFont);
			}
		});

		test("does not duplicate emoji fonts already present", () => {
			const input =
				"Menlo, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji";
			const result = withEmojiFontFallback(input);
			expect(result).toBe(input);
		});

		test("only appends missing emoji fonts", () => {
			const input = "Menlo, Apple Color Emoji";
			const result = withEmojiFontFallback(input);
			expect(result).toContain("Apple Color Emoji");
			expect(result).toContain("Segoe UI Emoji");
			expect(result).toContain("Noto Color Emoji");
			// Should not duplicate the one already present
			const count = (result.match(/Apple Color Emoji/g) ?? []).length;
			expect(count).toBe(1);
		});

		test("is case-insensitive when checking existing emoji fonts", () => {
			const input = "Menlo, apple color emoji";
			const result = withEmojiFontFallback(input);
			// Should not add Apple Color Emoji again
			expect(result).not.toContain(", Apple Color Emoji");
			// But should add the other two
			expect(result).toContain("Segoe UI Emoji");
			expect(result).toContain("Noto Color Emoji");
		});
	});
});
