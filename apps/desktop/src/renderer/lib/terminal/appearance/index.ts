import type { ITheme } from "@xterm/xterm";
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
			GENERIC_FONT_FAMILIES.has(family)
				? family
				: `"${family.replaceAll('"', '\\"')}"`,
		)
		.join(", ");
}

export const DEFAULT_TERMINAL_FONT_FAMILIES = [
	"JetBrains Mono",
	"JetBrainsMono Nerd Font",
	"MesloLGM Nerd Font",
	"MesloLGM NF",
	"MesloLGS NF",
	"MesloLGS Nerd Font",
	"Hack Nerd Font",
	"FiraCode Nerd Font",
	"CaskaydiaCove Nerd Font",
	"Menlo",
	"Monaco",
	"Courier New",
	"monospace",
] as const;

export const DEFAULT_TERMINAL_FONT_FAMILY = serializeFontFamilyList([
	...DEFAULT_TERMINAL_FONT_FAMILIES,
]);

export const DEFAULT_TERMINAL_FONT_SIZE = 14;

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
): string {
	if (!cssValue || !cssValue.trim()) return DEFAULT_TERMINAL_FONT_FAMILY;
	const families = parseFontFamilyList(cssValue);
	if (families.length === 0) return DEFAULT_TERMINAL_FONT_FAMILY;

	// Validate the actual CSS primary (first entry), not the first non-generic.
	// A value like `sans-serif, "JetBrains Mono"` resolves to sans-serif in the
	// browser regardless of what follows, so inspecting the later entry would
	// let proportional stacks slip through.
	const primary = families[0];
	const primaryKey = primary.toLowerCase();

	if (GENERIC_FONT_FAMILIES.has(primaryKey)) {
		if (MONOSPACE_GENERIC_FAMILIES.has(primaryKey)) return cssValue;
		console.warn(
			`[terminal] Font stack "${cssValue}" has no monospace primary family; falling back to default terminal font.`,
		);
		return DEFAULT_TERMINAL_FONT_FAMILY;
	}

	if (!isFontFamilyMonospace(primary)) {
		console.warn(
			`[terminal] Font "${primary}" is not monospace; falling back to default terminal font.`,
		);
		return DEFAULT_TERMINAL_FONT_FAMILY;
	}
	// Ensure a generic monospace tail — if the configured primary isn't
	// installed on this machine, the browser falls back to the OS monospace
	// generic instead of a proportional default (mirrors VS Code's behavior
	// in src/vs/workbench/contrib/terminal/browser/terminalConfigurationService.ts).
	const hasMonoTail = families.some((f) =>
		MONOSPACE_GENERIC_FAMILIES.has(f.toLowerCase()),
	);
	return hasMonoTail ? cssValue : `${cssValue}, monospace`;
}

/** Reads localStorage theme cache for flash-free first paint. */
export function getDefaultTerminalAppearance(): TerminalAppearance {
	const theme = readCachedTerminalTheme();
	return {
		theme,
		background: theme.background ?? "#151110",
		fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
		fontSize: DEFAULT_TERMINAL_FONT_SIZE,
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
