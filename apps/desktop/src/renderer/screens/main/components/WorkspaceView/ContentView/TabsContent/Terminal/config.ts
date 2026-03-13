import type { ITerminalOptions } from "@xterm/xterm";

// Use user's theme
export const TERMINAL_THEME: ITerminalOptions["theme"] = undefined;

// Fallback timeout for first render (in case xterm doesn't emit onRender)
export const FIRST_RENDER_RESTORE_FALLBACK_MS = 250;

// Debug logging for terminal lifecycle (enable via localStorage)
// Run in DevTools console: localStorage.setItem('SUPERSET_TERMINAL_DEBUG', '1')
export const DEBUG_TERMINAL =
	typeof localStorage !== "undefined" &&
	localStorage.getItem("SUPERSET_TERMINAL_DEBUG") === "1";

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
	// SF fonts for Apple tools (swift, xcodebuild) that use SF Symbols private use area characters
	"SF Mono",
	"SF Pro",
	// CJK monospace fonts — must come before the generic "monospace" fallback.
	// CJK characters (Chinese/Japanese/Korean) are full-width (2 terminal cells).
	// Without an explicit CJK monospace font, the browser falls back to a system
	// font whose glyph width may not equal exactly 2× the primary cell width,
	// causing xterm.js underline decorations to drift from the actual glyph
	// positions in mixed-width lines. Sarasa Mono and Noto Sans Mono CJK are
	// designed so each CJK glyph is exactly 2× a half-width cell, keeping
	// underlines aligned regardless of renderer (WebGL or DOM).
	"Sarasa Mono SC",
	"Sarasa Mono TC",
	"Sarasa Mono HC",
	"Sarasa Mono J",
	"Sarasa Mono K",
	"Noto Sans Mono CJK SC",
	"Noto Sans Mono CJK TC",
	"Noto Sans Mono CJK HK",
	"Noto Sans Mono CJK JP",
	"Noto Sans Mono CJK KR",
	"monospace",
].join(", ");

export const DEFAULT_TERMINAL_FONT_SIZE = 14;

export const TERMINAL_OPTIONS: ITerminalOptions = {
	cursorBlink: true,
	fontSize: DEFAULT_TERMINAL_FONT_SIZE,
	fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
	theme: TERMINAL_THEME,
	allowProposedApi: true,
	scrollback: 2000,
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
