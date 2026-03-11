import { describe, expect, test } from "bun:test";
import { getDiffViewerStyle } from "./code-theme";

/**
 * Parses a hex color string into [r, g, b] (0-255).
 */
function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	return [
		Number.parseInt(h.slice(0, 2), 16),
		Number.parseInt(h.slice(2, 4), 16),
		Number.parseInt(h.slice(4, 6), 16),
	];
}

/**
 * Computes relative luminance per WCAG 2.0.
 * https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
function relativeLuminance(r: number, g: number, b: number): number {
	const [rs, gs, bs] = [r, g, b].map((c) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Computes WCAG contrast ratio between two luminances.
 */
function contrastRatio(l1: number, l2: number): number {
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Approximates color-mix(in srgb, color1 pct%, color2) by linear interpolation.
 */
function colorMixSrgb(
	c1: [number, number, number],
	pct1: number,
	c2: [number, number, number],
): [number, number, number] {
	const p = pct1 / 100;
	return [
		Math.round(c1[0] * p + c2[0] * (1 - p)),
		Math.round(c1[1] * p + c2[1] * (1 - p)),
		Math.round(c1[2] * p + c2[2] * (1 - p)),
	];
}

/**
 * Composites a semi-transparent foreground color on an opaque background.
 */
function alphaComposite(
	fg: [number, number, number],
	alpha: number,
	bg: [number, number, number],
): [number, number, number] {
	return [
		Math.round(fg[0] * alpha + bg[0] * (1 - alpha)),
		Math.round(fg[1] * alpha + bg[1] * (1 - alpha)),
		Math.round(fg[2] * alpha + bg[2] * (1 - alpha)),
	];
}

// Colors from MIDNIGHT_CODE_COLORS
const BASE_BG = hexToRgb("#282c34");
const ADDITION_COLOR = hexToRgb("#98c379");


// Muted grey used by one-dark-pro for markdown blockquote/comment tokens
const BLOCKQUOTE_TOKEN_GREY = hexToRgb("#7f848e");

// The @pierre/diffs library computes addition background in dark mode as:
//   color-mix(in lab, base-bg 80%, addition-color)
// Approximated here with sRGB mixing (close enough for contrast testing).
const ADDITION_BG = colorMixSrgb(BASE_BG, 80, ADDITION_COLOR);

// Addition emphasis overlay: rgba(addition-color, 0.2) composited on addition bg
const ADDITION_EMPHASIS_BG = alphaComposite(ADDITION_COLOR, 0.2, ADDITION_BG);

describe("diff viewer contrast for markdown quote blocks", () => {
	test("grey blockquote token has poor contrast on addition background without fix (reproduces issue #2366)", () => {
		// This test demonstrates the bug: grey blockquote text (#7f848e) on the
		// green addition background has a contrast ratio well below WCAG AA (4.5:1).
		const tokenLum = relativeLuminance(...BLOCKQUOTE_TOKEN_GREY);
		const bgLum = relativeLuminance(...ADDITION_BG);
		const ratio = contrastRatio(tokenLum, bgLum);

		// The contrast ratio for grey on addition bg is ~2.8:1 — too low.
		expect(ratio).toBeLessThan(4.5);
	});

	test("grey blockquote token has even worse contrast on addition emphasis background (reproduces issue #2366)", () => {
		// With the emphasis overlay (changed-text highlight), contrast drops further.
		const tokenLum = relativeLuminance(...BLOCKQUOTE_TOKEN_GREY);
		const emphBgLum = relativeLuminance(...ADDITION_EMPHASIS_BG);
		const ratio = contrastRatio(tokenLum, emphBgLum);

		// The contrast ratio with emphasis is ~2.1:1 — terrible.
		expect(ratio).toBeLessThan(3.0);
	});

	test("getDiffViewerStyle includes unsafeCSS-compatible emphasis overrides to improve contrast", () => {
		const style = getDiffViewerStyle({});
		const styleRecord = style as Record<string, string>;

		// The fix should override emphasis backgrounds to reduce green overlay intensity
		expect(styleRecord["--diffs-bg-addition-emphasis-override"]).toBeDefined();
		expect(styleRecord["--diffs-bg-deletion-emphasis-override"]).toBeDefined();
	});

	test("lightened blockquote token achieves adequate contrast on addition background", () => {
		// After the fix, tokens in addition lines are lightened via CSS color-mix.
		// Simulating color-mix(in srgb, #7f848e 65%, white):
		const lightenedToken = colorMixSrgb(
			BLOCKQUOTE_TOKEN_GREY,
			65,
			[255, 255, 255],
		);

		const tokenLum = relativeLuminance(...lightenedToken);
		const bgLum = relativeLuminance(...ADDITION_BG);
		const ratio = contrastRatio(tokenLum, bgLum);

		// After lightening tokens, contrast should meet or approach WCAG AA (4.5:1).
		expect(ratio).toBeGreaterThan(4.0);
	});

	test("lightened blockquote token achieves adequate contrast on reduced emphasis background", () => {
		// After the fix: tokens lightened + emphasis reduced to 10% opacity.
		const lightenedToken = colorMixSrgb(
			BLOCKQUOTE_TOKEN_GREY,
			65,
			[255, 255, 255],
		);
		const reducedEmphasisBg = alphaComposite(ADDITION_COLOR, 0.1, ADDITION_BG);

		const tokenLum = relativeLuminance(...lightenedToken);
		const emphBgLum = relativeLuminance(...reducedEmphasisBg);
		const ratio = contrastRatio(tokenLum, emphBgLum);

		// With both fixes, contrast on emphasis bg should be significantly better.
		expect(ratio).toBeGreaterThan(3.5);
	});
});
