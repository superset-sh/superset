import type { ITerminalOptions } from "@xterm/xterm";
import { DEFAULT_TERMINAL_SCROLLBACK } from "shared/constants";

// Use user's theme
export const TERMINAL_THEME: ITerminalOptions["theme"] = undefined;

// Fallback timeout for first render (in case xterm doesn't emit onRender)
export const FIRST_RENDER_RESTORE_FALLBACK_MS = 250;

// Debug logging for terminal lifecycle (enable via localStorage)
// Run in DevTools console: localStorage.setItem('SUPERSET_TERMINAL_DEBUG', '1')
export const DEBUG_TERMINAL =
	typeof localStorage !== "undefined" &&
	localStorage.getItem("SUPERSET_TERMINAL_DEBUG") === "1";

// System emoji fonts listed early so xterm.js picks color-emoji glyphs
// for emoji/symbol characters (e.g. ⏱, ⏸) instead of the monochrome
// Nerd-Font override that would otherwise win via CSS font-family order.
// Emoji fonts only contain emoji glyphs, so regular text and Nerd-Font
// PUA icons (Powerline, devicons, etc.) fall through to the next font.
export const EMOJI_FONT_FAMILIES = [
	"Apple Color Emoji",
	"Segoe UI Emoji",
	"Noto Color Emoji",
];

export const DEFAULT_TERMINAL_FONT_FAMILY = [
	// Emoji fonts first so emoji characters render as color emoji
	// (matching native terminal behavior), not as Nerd Font overrides.
	...EMOJI_FONT_FAMILIES,
	// Nerd Fonts for shell theme compatibility (Oh My Posh, Powerlevel10k, etc.)
	"MesloLGM Nerd Font",
	"MesloLGM NF",
	"MesloLGS NF",
	"MesloLGS Nerd Font",
	"Hack Nerd Font",
	"FiraCode Nerd Font",
	"JetBrainsMono Nerd Font",
	"CaskaydiaCove Nerd Font",
	"Menlo",
	"Monaco",
	'"Courier New"',
	"monospace",
].join(", ");

/**
 * Ensures emoji font families are present in a font family string.
 * Emoji fonts are prepended so they take priority over Nerd Fonts for
 * emoji/symbol characters, matching native terminal rendering behavior.
 */
export function withEmojiFontFallback(fontFamily: string): string {
	const lower = fontFamily.toLowerCase();
	const missing = EMOJI_FONT_FAMILIES.filter(
		(f) => !lower.includes(f.toLowerCase()),
	);
	if (missing.length === 0) return fontFamily;
	return `${missing.join(", ")}, ${fontFamily}`;
}

export const DEFAULT_TERMINAL_FONT_SIZE = 14;

export const TERMINAL_OPTIONS: ITerminalOptions = {
	cursorBlink: true,
	fontSize: DEFAULT_TERMINAL_FONT_SIZE,
	fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
	theme: TERMINAL_THEME,
	allowProposedApi: true,
	scrollback: DEFAULT_TERMINAL_SCROLLBACK,
	// Allow Option+key to type special characters on international keyboards (e.g., Option+2 = @)
	macOptionIsMeta: false,
	cursorStyle: "block",
	cursorInactiveStyle: "outline",
	screenReaderMode: false,
	// xterm's fit addon permanently reserves scrollbar width from usable columns.
	// Hide the built-in scrollbar so terminal content can use the full pane width.
	scrollbar: {
		showScrollbar: false,
	},
};

export const RESIZE_DEBOUNCE_MS = 150;
