import type { FontWeight, ITheme } from "@xterm/xterm";
import { toXtermTheme } from "renderer/stores/theme/utils";
import {
	builtInThemes,
	DEFAULT_THEME_ID,
	getTerminalColors,
} from "shared/themes";

export interface TerminalAppearance {
	theme: ITheme;
	background: string;
	fontFamily: string;
	fontSize: number;
	lineHeight: number;
	letterSpacing: number;
	fontWeight: FontWeight;
	ligatures: boolean;
	minimumContrastRatio: number;
	cursorStyle: "block" | "bar" | "underline";
	cursorBlink: boolean;
}

export interface TerminalFontSettings {
	terminalFontFamily?: string | null;
	terminalFontSize?: number | null;
	terminalLineHeight?: number | null;
	terminalLetterSpacing?: number | null;
	terminalFontWeight?: number | null;
	terminalLigatures?: boolean | null;
	terminalMinimumContrast?: number | null;
	terminalCursorStyle?: "block" | "bar" | "underline" | null;
	terminalCursorBlink?: boolean | null;
}

export const TERMINAL_FONT_FAMILY_CSS_VARIABLE =
	"--superset-terminal-font-family";

export function applyTerminalFontFamilyCssVariable(
	element: HTMLElement,
	fontFamily: string,
): void {
	element.style.setProperty(TERMINAL_FONT_FAMILY_CSS_VARIABLE, fontFamily);
}

const GENERIC_FONT_FAMILIES = new Set([
	"serif",
	"sans-serif",
	"monospace",
	"cursive",
	"fantasy",
	"system-ui",
	"ui-serif",
	"ui-sans-serif",
	"ui-monospace",
	"ui-rounded",
	"emoji",
	"math",
	"fangsong",
]);

function serializeFontFamilyList(families: string[]): string {
	return families
		.map((family) =>
			GENERIC_FONT_FAMILIES.has(family.toLowerCase())
				? family
				: // Backslashes first, then quotes — a family ending in "\" would
					// otherwise escape its own closing quote and invalidate the value.
					`"${family.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`,
		)
		.join(", ");
}

/**
 * Icon-capable fallback families appended after the user's chosen font so
 * Nerd Font glyphs (private-use-area icons from eza/starship/etc.) resolve
 * even when the primary font lacks them. CSS font matching is per-character,
 * so these only ever supply glyphs the earlier families are missing.
 */
export const NERD_FONT_FALLBACK_FAMILIES = [
	"JetBrainsMono Nerd Font",
	"MesloLGM Nerd Font",
	"MesloLGM NF",
	"MesloLGS NF",
	"MesloLGS Nerd Font",
	"Hack Nerd Font",
	"FiraCode Nerd Font",
	"CaskaydiaCove Nerd Font",
	"Symbols Nerd Font Mono",
	"Symbols Nerd Font",
] as const;

export const DEFAULT_TERMINAL_FONT_FAMILIES = [
	"JetBrains Mono",
	...NERD_FONT_FALLBACK_FAMILIES,
	"Menlo",
	"Monaco",
	"Courier New",
	"monospace",
] as const;

export const DEFAULT_TERMINAL_FONT_FAMILY = serializeFontFamilyList([
	...DEFAULT_TERMINAL_FONT_FAMILIES,
]);

export const DEFAULT_TERMINAL_FONT_SIZE = 14;
export const DEFAULT_TERMINAL_LINE_HEIGHT = 1;
export const DEFAULT_TERMINAL_LETTER_SPACING = 0;
export const DEFAULT_TERMINAL_FONT_WEIGHT: FontWeight = "normal";
export const DEFAULT_TERMINAL_LIGATURES = true;
export const DEFAULT_TERMINAL_MINIMUM_CONTRAST = 1;
export const DEFAULT_TERMINAL_CURSOR_STYLE = "block" as const;
export const DEFAULT_TERMINAL_CURSOR_BLINK = true;

const MONOSPACE_GENERIC_FAMILIES = new Set(["monospace", "ui-monospace"]);

/** Parse a CSS font-family list into trimmed entries, respecting quoted names. */
function parseFontFamilyList(cssValue: string): string[] {
	const families: string[] = [];
	let current = "";
	let inQuote: string | null = null;

	for (const ch of cssValue) {
		if (inQuote) {
			if (ch === inQuote) inQuote = null;
			else current += ch;
		} else if (ch === '"' || ch === "'") {
			inQuote = ch;
		} else if (ch === ",") {
			const trimmed = current.trim();
			if (trimmed) families.push(trimmed);
			current = "";
		} else {
			current += ch;
		}
	}
	const last = current.trim();
	if (last) families.push(last);
	return families;
}

const monospaceCheckCache = new Map<string, boolean>();

/**
 * Heuristically decide whether `family` is a monospace font using canvas
 * measurement — monospace fonts render narrow ("iiiiii") and wide ("MMMMMM")
 * runs at the same width. Returns `true` (permissive) when the canvas API
 * is unavailable (tests/SSR) so we never block a legitimate font.
 */
function isFontFamilyMonospace(family: string): boolean {
	const key = family.toLowerCase();
	if (MONOSPACE_GENERIC_FAMILIES.has(key)) return true;

	const cached = monospaceCheckCache.get(key);
	if (cached !== undefined) return cached;

	try {
		if (typeof document === "undefined") return true;
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext?.("2d");
		if (!ctx) return true;

		ctx.font = `16px "${family}"`;
		const narrow = ctx.measureText("iiiiii").width;
		const wide = ctx.measureText("MMMMMM").width;
		// Sub-pixel jitter tolerance.
		const isMono = Math.abs(narrow - wide) < 1;
		monospaceCheckCache.set(key, isMono);
		return isMono;
	} catch {
		return true;
	}
}

/**
 * Guard against a persisted terminal font that would break xterm rendering
 * (e.g. a proportional font like "Inter"). Returns the raw CSS value when
 * the primary family is monospace; otherwise falls back to the bundled
 * default so a poisoned setting can never blank the app on startup.
 *
 * See issue #3513. The settings UI already prevents new non-monospace
 * selections for the terminal, but this recovers users whose DB was
 * poisoned before the UI restriction was added.
 */
export function sanitizeTerminalFontFamily(
	cssValue: string | null | undefined,
	installedIconFonts: readonly string[] = [],
): string {
	const defaultStack = () =>
		buildIconCapableStack(
			[...DEFAULT_TERMINAL_FONT_FAMILIES],
			installedIconFonts,
		);

	if (!cssValue || !cssValue.trim()) return defaultStack();
	const families = parseFontFamilyList(cssValue);
	if (families.length === 0) return defaultStack();

	// Validate the actual CSS primary (first entry), not the first non-generic.
	// A value like `sans-serif, "JetBrains Mono"` resolves to sans-serif in the
	// browser regardless of what follows, so inspecting the later entry would
	// let proportional stacks slip through.
	const primary = families[0];
	const primaryKey = primary.toLowerCase();

	if (GENERIC_FONT_FAMILIES.has(primaryKey)) {
		if (!MONOSPACE_GENERIC_FAMILIES.has(primaryKey)) {
			console.warn(
				`[terminal] Font stack "${cssValue}" has no monospace primary family; falling back to default terminal font.`,
			);
			return defaultStack();
		}
	} else if (!isFontFamilyMonospace(primary)) {
		console.warn(
			`[terminal] Font "${primary}" is not monospace; falling back to default terminal font.`,
		);
		return defaultStack();
	}
	return buildIconCapableStack(families, installedIconFonts);
}

/**
 * Re-serialize a validated family list with every non-generic name quoted,
 * Nerd Font fallbacks merged in, and a generic monospace tail.
 *
 * Quoting: the persisted setting is a bare family name, and families that
 * aren't valid unquoted CSS idents (e.g. the digit-led "0xProto Nerd Font")
 * otherwise invalidate the whole font-family value — canvas `ctx.font` then
 * silently keeps its previous value, so the WebGL glyph atlas rasterizes with
 * the default sans-serif: every icon becomes tofu and cell metrics diverge
 * (SUPER-1782).
 *
 * Fallbacks: CSS font matching is per-character, so appending icon-capable
 * families after the user's choice only ever supplies glyphs the chosen font
 * is missing — without them, picking any font dropped the default stack's
 * Nerd Font tail and PUA icons went tofu. `installedIconFonts` extends the
 * well-known names with Nerd Fonts actually installed on this machine.
 *
 * Generic tail: keeps an uninstalled primary from falling back to a
 * proportional default (mirrors VS Code's terminalConfigurationService).
 */
function buildIconCapableStack(
	families: string[],
	installedIconFonts: readonly string[],
): string {
	const seen = new Set(families.map((f) => f.toLowerCase()));
	const fallbacks: string[] = [];
	for (const f of [...NERD_FONT_FALLBACK_FAMILIES, ...installedIconFonts]) {
		const key = f.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		fallbacks.push(f);
	}
	// Insert before the generic tail, but never before the primary — a
	// generic-monospace primary (e.g. bare "monospace") must stay first while
	// still gaining the icon fallbacks after it.
	const firstGenericIdx = families.findIndex((f) =>
		GENERIC_FONT_FAMILIES.has(f.toLowerCase()),
	);
	const insertAt =
		firstGenericIdx === -1 ? families.length : Math.max(firstGenericIdx, 1);
	const merged = [
		...families.slice(0, insertAt),
		...fallbacks,
		...families.slice(insertAt),
	];
	if (!merged.some((f) => MONOSPACE_GENERIC_FAMILIES.has(f.toLowerCase()))) {
		merged.push("monospace");
	}
	return serializeFontFamilyList(merged);
}

/** Reads localStorage theme cache for flash-free first paint. */
export function getDefaultTerminalAppearance(): TerminalAppearance {
	const theme = readCachedTerminalTheme();
	return resolveTerminalAppearance(theme);
}

export function resolveTerminalAppearance(
	theme: ITheme,
	fontSettings: TerminalFontSettings = {},
	installedIconFonts: readonly string[] = [],
): TerminalAppearance {
	return {
		theme,
		background: theme.background ?? "#151110",
		fontFamily: sanitizeTerminalFontFamily(
			fontSettings.terminalFontFamily,
			installedIconFonts,
		),
		fontSize: fontSettings.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE,
		lineHeight: fontSettings.terminalLineHeight ?? DEFAULT_TERMINAL_LINE_HEIGHT,
		letterSpacing:
			fontSettings.terminalLetterSpacing ?? DEFAULT_TERMINAL_LETTER_SPACING,
		fontWeight: fontSettings.terminalFontWeight ?? DEFAULT_TERMINAL_FONT_WEIGHT,
		ligatures: fontSettings.terminalLigatures ?? DEFAULT_TERMINAL_LIGATURES,
		minimumContrastRatio:
			fontSettings.terminalMinimumContrast ?? DEFAULT_TERMINAL_MINIMUM_CONTRAST,
		cursorStyle:
			fontSettings.terminalCursorStyle ?? DEFAULT_TERMINAL_CURSOR_STYLE,
		cursorBlink:
			fontSettings.terminalCursorBlink ?? DEFAULT_TERMINAL_CURSOR_BLINK,
	};
}

function readCachedTerminalTheme(): ITheme {
	try {
		const cachedTerminal = localStorage.getItem("theme-terminal");
		if (cachedTerminal) {
			return toXtermTheme(JSON.parse(cachedTerminal));
		}
		const themeId = localStorage.getItem("theme-id") ?? DEFAULT_THEME_ID;
		const theme = builtInThemes.find((t) => t.id === themeId);
		if (theme) {
			return toXtermTheme(getTerminalColors(theme));
		}
	} catch {}
	const defaultTheme = builtInThemes.find((t) => t.id === DEFAULT_THEME_ID);
	return defaultTheme
		? toXtermTheme(getTerminalColors(defaultTheme))
		: { background: "#151110", foreground: "#eae8e6" };
}
