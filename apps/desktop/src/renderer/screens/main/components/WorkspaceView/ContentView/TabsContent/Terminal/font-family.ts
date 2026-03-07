import { DEFAULT_TERMINAL_FONT_FAMILY } from "./config";
import {
	BUNDLED_TERMINAL_FONT_CSS_FAMILY,
	BUNDLED_TERMINAL_FONT_FAMILY,
} from "./fonts";

function normalizeFontFamilyToken(token: string): string {
	const trimmed = token.trim();
	if (!trimmed) return BUNDLED_TERMINAL_FONT_CSS_FAMILY;
	if (trimmed.startsWith('"') || trimmed.startsWith("'")) return trimmed;
	return /\s/.test(trimmed) ? `"${trimmed}"` : trimmed;
}

function getPrimaryFontFamily(fontFamily: string): string {
	const primary = fontFamily.split(",")[0];
	return normalizeFontFamilyToken(primary ?? BUNDLED_TERMINAL_FONT_FAMILY);
}

export function resolveTerminalFontFamily(
	fontFamily: string | null | undefined,
): string {
	const requested = fontFamily?.trim();
	if (!requested) return DEFAULT_TERMINAL_FONT_FAMILY;
	if (requested.includes(BUNDLED_TERMINAL_FONT_FAMILY)) return requested;
	return `${requested}, ${DEFAULT_TERMINAL_FONT_FAMILY}`;
}

export async function preloadTerminalFonts(
	fontFamily: string,
	fontSize: number,
): Promise<void> {
	if (
		typeof document === "undefined" ||
		typeof document.fonts === "undefined"
	) {
		return;
	}

	const families = new Set<string>([
		getPrimaryFontFamily(fontFamily),
		BUNDLED_TERMINAL_FONT_CSS_FAMILY,
	]);

	try {
		await Promise.all(
			Array.from(families, (family) =>
				document.fonts.load(`${fontSize}px ${family}`),
			),
		);
		await document.fonts.ready;
	} catch {
		// Ignore font preloading failures and allow the browser fallback stack to apply.
	}
}
