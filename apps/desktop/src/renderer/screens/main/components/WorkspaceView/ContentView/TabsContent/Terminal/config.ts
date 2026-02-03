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
const TERMINAL_FONT_FAMILY = [
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
	"monospace",
].join(", ");

export const TERMINAL_OPTIONS: ITerminalOptions = {
	cursorBlink: true,
	fontSize: 14,
	fontFamily: TERMINAL_FONT_FAMILY,
	theme: TERMINAL_THEME,
	allowProposedApi: true,
	scrollback: 10000,
	// Allow Option+key to type special characters on international keyboards (e.g., Option+2 = @)
	macOptionIsMeta: false,
	cursorStyle: "block",
	cursorInactiveStyle: "outline",
	screenReaderMode: false,
};

export const RESIZE_DEBOUNCE_MS = 150;
