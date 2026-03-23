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

	describe("withEmojiFontFallback", () => {
		test("prepends emoji fonts to a custom font family that lacks them", () => {
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

		test("only prepends missing emoji fonts", () => {
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

describe("Terminal font config — emoji before Nerd Fonts (#2791)", () => {
	const NERD_FONTS = [
		"MesloLGM Nerd Font",
		"MesloLGM NF",
		"MesloLGS NF",
		"MesloLGS Nerd Font",
		"Hack Nerd Font",
		"FiraCode Nerd Font",
		"JetBrainsMono Nerd Font",
		"CaskaydiaCove Nerd Font",
	];

	test("emoji fonts appear BEFORE Nerd Fonts in the default family", () => {
		// Bug #2791: xterm.js uses CSS font-family order, so Nerd Fonts
		// listed before emoji fonts cause emoji characters (⏱, ⏸, etc.)
		// to render with Nerd Font glyphs instead of color emoji — making
		// Claude Code status line icons look different than in native terminals.
		for (const emojiFont of EMOJI_FONT_FAMILIES) {
			const emojiIdx = DEFAULT_TERMINAL_FONT_FAMILY.indexOf(emojiFont);
			for (const nerdFont of NERD_FONTS) {
				const nerdIdx = DEFAULT_TERMINAL_FONT_FAMILY.indexOf(nerdFont);
				if (nerdIdx === -1) continue;
				expect(emojiIdx).toBeLessThan(nerdIdx);
			}
		}
	});

	test("emoji fonts appear BEFORE system monospace fonts in the default family", () => {
		const monospaceIdx = DEFAULT_TERMINAL_FONT_FAMILY.indexOf("monospace");
		for (const emojiFont of EMOJI_FONT_FAMILIES) {
			const emojiIdx = DEFAULT_TERMINAL_FONT_FAMILY.indexOf(emojiFont);
			expect(emojiIdx).toBeLessThan(monospaceIdx);
		}
	});

	test("withEmojiFontFallback places emoji fonts BEFORE the user font", () => {
		// When a user sets a custom Nerd Font, emoji fonts must come first
		// so emoji characters still render with the emoji font.
		const result = withEmojiFontFallback("MesloLGM Nerd Font, monospace");
		const emojiIdx = result.indexOf("Apple Color Emoji");
		const nerdIdx = result.indexOf("MesloLGM Nerd Font");
		expect(emojiIdx).toBeLessThan(nerdIdx);
	});
});
