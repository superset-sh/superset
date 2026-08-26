import { describe, expect, it } from "bun:test";
import type { ITheme } from "@xterm/xterm";
import type { TerminalColors } from "shared/themes/types";
import { toXtermTheme } from "./terminal-theme";

/**
 * Mirrors how @xterm/addon-webgl reads the fill colour when rasterising a
 * pattern glyph — the shade blocks ░ ▒ ▓ (customGlyphs/CustomGlyphRasterizer.ts,
 * drawPatternChar). It inspects `ctx.fillStyle` as a string and understands only
 * hex and `rgba()`; anything else throws, which aborts the frame before the
 * WebGL renderer draws anything.
 */
function rasterizePatternGlyph(fillStyle: string): void {
	if (fillStyle.startsWith("#") || fillStyle.startsWith("rgba")) {
		return;
	}
	throw new Error(
		`Unexpected fillStyle color format "${fillStyle}" when drawing pattern glyph`,
	);
}

function colorValues(theme: ITheme): string[] {
	return Object.values(theme).filter(
		(value): value is string => typeof value === "string",
	);
}

/** The terminal palette of the published "Obsidian" theme, verbatim. */
const obsidianColors: TerminalColors = {
	background: "oklch(0.1408 0.0044 265)",
	foreground: "oklch(0.9824 0.0013 265)",
	cursor: "oklch(0.9824 0.0013 265)",
	cursorAccent: "oklch(0.1408 0.0044 265)",
	selectionBackground: "oklch(0.58 0.12 265 / 35%)",
	black: "oklch(0.1408 0.0044 265)",
	red: "oklch(0.72 0.27 25)",
	green: "oklch(0.78 0.25 155)",
	yellow: "oklch(0.82 0.24 85)",
	blue: "oklch(0.74 0.2 265)",
	magenta: "oklch(0.72 0.2 315)",
	cyan: "oklch(0.76 0.15 205)",
	white: "oklch(0.9824 0.0013 265)",
	brightBlack: "oklch(0.58 0.012 265)",
	brightRed: "oklch(0.82 0.22 25)",
	brightGreen: "oklch(0.84 0.2 155)",
	brightYellow: "oklch(0.88 0.18 85)",
	brightBlue: "oklch(0.82 0.16 265)",
	brightMagenta: "oklch(0.82 0.17 315)",
	brightCyan: "oklch(0.84 0.15 205)",
	brightWhite: "oklch(1 0 0)",
};

const hexColors: TerminalColors = {
	background: "#000000",
	foreground: "#ffffff",
	cursor: "#ffffff",
	cursorAccent: "#000000",
	selectionBackground: "#388bfd40",
	black: "#2e3436",
	red: "#cc0000",
	green: "#4e9a06",
	yellow: "#c4a000",
	blue: "#3465a4",
	magenta: "#75507b",
	cyan: "#06989a",
	white: "#d3d7cf",
	brightBlack: "#555753",
	brightRed: "#ef2929",
	brightGreen: "#8ae234",
	brightYellow: "#fce94f",
	brightBlue: "#729fcf",
	brightMagenta: "#ad7fa8",
	brightCyan: "#34e2e2",
	brightWhite: "#eeeeec",
};

describe("toXtermTheme", () => {
	it("hands the pattern glyph rasteriser only colours it can parse", () => {
		for (const value of colorValues(toXtermTheme(obsidianColors))) {
			expect(() => rasterizePatternGlyph(value)).not.toThrow();
		}
	});

	it("converts the palette entry from the reported crash", () => {
		// "oklch(0.78 0.25 155)" is the fill colour in DESKTOP-11R.
		expect(toXtermTheme(obsidianColors).green).toBe("#00e269");
	});

	it("keeps alpha when a colour is translucent", () => {
		expect(toXtermTheme(obsidianColors).selectionBackground).toBe("#5777c159");
	});

	it("passes hex colours through unchanged", () => {
		expect(toXtermTheme(hexColors)).toMatchObject(hexColors);
	});

	it("converts colours in any other notation rather than dropping them", () => {
		const theme = toXtermTheme({
			...hexColors,
			red: "rgb(255, 0, 0)",
			green: "hsl(120, 100%, 50%)",
			blue: "rebeccapurple",
		});
		expect(theme.red).toBe("#ff0000");
		expect(theme.green).toBe("#00ff00");
		expect(theme.blue).toBe("#663399");
	});

	it("drops a colour it cannot parse instead of forwarding it", () => {
		const theme = toXtermTheme({ ...hexColors, red: "not-a-color" });
		expect(theme.red).toBeUndefined();
		expect(theme.green).toBe("#4e9a06");
	});
});
