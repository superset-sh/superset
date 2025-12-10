import { formatHex, parse } from "culori";

/**
 * Convert any CSS color (oklch, rgb, hsl, etc.) to hex format.
 */
export function toHex(color: string): string {
	// Already hex
	if (color.startsWith("#")) {
		return color;
	}

	const parsed = parse(color);
	if (!parsed) {
		console.warn(`toHex: unsupported color format: ${color}`);
		return color;
	}

	return formatHex(parsed);
}
