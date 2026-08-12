import { formatHex, formatHex8, parse, wcagContrast } from "culori";

/**
 * Convert any CSS color to hex format (#RRGGBB)
 */
export function toHex(color: string): string {
	const parsed = parse(color);
	if (!parsed) {
		return color;
	}
	return formatHex(parsed);
}

/**
 * Convert any CSS color to hex8 format (#RRGGBBAA)
 */
export function toHex8(color: string): string {
	const parsed = parse(color);
	if (!parsed) {
		return color;
	}
	return formatHex8(parsed);
}

/**
 * Convert color to hex, using hex8 only if alpha < 1
 */
export function toHexAuto(color: string): string {
	const parsed = parse(color);
	if (!parsed) {
		return color;
	}
	if (parsed.alpha !== undefined && parsed.alpha < 1) {
		return formatHex8(parsed);
	}
	return formatHex(parsed);
}

/**
 * Apply alpha to a color and return as hex8
 */
export function withAlpha(color: string, alpha: number): string {
	const parsed = parse(color);
	if (!parsed) {
		return color;
	}
	parsed.alpha = alpha;
	return formatHex8(parsed);
}

/**
 * Strip # prefix from hex color
 */
export function stripHash(hex: string): string {
	return hex.replace("#", "");
}

/**
 * WCAG contrast ratio (1–21) between a foreground and background color.
 * Returns 1 (worst case) if either color can't be parsed.
 */
export function contrastRatio(foreground: string, background: string): number {
	const fg = parse(foreground);
	const bg = parse(background);
	if (!fg || !bg) {
		return 1;
	}
	return wcagContrast(fg, bg);
}
