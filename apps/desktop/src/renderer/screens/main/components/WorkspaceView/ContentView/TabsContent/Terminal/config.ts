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

// System emoji fonts used as fallbacks so emoji glyphs render correctly
// in monospace terminal fonts that lack emoji coverage.
export const EMOJI_FONT_FAMILIES = [
	"Apple Color Emoji",
	"Segoe UI Emoji",
	"Noto Color Emoji",
];

// Nerd Fonts first for shell theme compatibility (Oh My Posh, Powerlevel10k, etc.)
export const DEFAULT_TERMINAL_FONT_FAMILY = [
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
	...EMOJI_FONT_FAMILIES,
].join(", ");

/**
 * Ensures emoji font families are present as fallbacks in a font family string.
 * Used when applying user-provided custom font settings to guarantee emoji rendering.
 */
export function withEmojiFontFallback(fontFamily: string): string {
	const lower = fontFamily.toLowerCase();
	const missing = EMOJI_FONT_FAMILIES.filter(
		(f) => !lower.includes(f.toLowerCase()),
	);
	if (missing.length === 0) return fontFamily;
	return `${fontFamily}, ${missing.join(", ")}`;
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
