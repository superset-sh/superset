import type { ITerminalOptions } from "ghostty-web";
import { BUNDLED_TERMINAL_FONT_CSS_FAMILY } from "./fonts";

// Use user's theme
export const TERMINAL_THEME: ITerminalOptions["theme"] = undefined;

// Fallback timeout for first render (in case xterm doesn't emit onRender)
export const FIRST_RENDER_RESTORE_FALLBACK_MS = 250;

// Bundled Nerd Font first so terminal glyphs and metrics are deterministic.
export const DEFAULT_TERMINAL_FONT_FAMILY = [
	BUNDLED_TERMINAL_FONT_CSS_FAMILY,
	'"JetBrainsMono Nerd Font Mono"',
	'"JetBrainsMonoNerdFontMono"',
	'"JetBrains Mono"',
	'"SF Mono"',
	"Menlo",
	"Monaco",
	'"Courier New"',
	"monospace",
].join(", ");

export const DEFAULT_TERMINAL_FONT_SIZE = 14;

export const TERMINAL_OPTIONS: ITerminalOptions = {
	cursorBlink: true,
	fontSize: DEFAULT_TERMINAL_FONT_SIZE,
	fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
	theme: TERMINAL_THEME,
	scrollback: 2000,
	cursorStyle: "block",
};

export const RESIZE_DEBOUNCE_MS = 150;
