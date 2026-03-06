import type { ITerminalOptions } from "ghostty-web";

// Use user's theme
export const TERMINAL_THEME: ITerminalOptions["theme"] = undefined;

// Debug logging for terminal lifecycle (enable via localStorage)
// Run in DevTools console: localStorage.setItem('SUPERSET_TERMINAL_DEBUG', '1')
export const DEBUG_TERMINAL =
	typeof localStorage !== "undefined" &&
	localStorage.getItem("SUPERSET_TERMINAL_DEBUG") === "1";

// Nerd Fonts first for shell theme compatibility (Oh My Posh, Powerlevel10k, etc.)
export const DEFAULT_TERMINAL_FONT_FAMILY = [
	"MesloLGM Nerd Font Mono",
	"MesloLGS Nerd Font Mono",
	"MesloLGM Nerd Font",
	"MesloLGM NF",
	"MesloLGS NF",
	"MesloLGS Nerd Font",
	"Hack Nerd Font Mono",
	"Hack Nerd Font",
	"FiraCode Nerd Font Mono",
	"FiraCode Nerd Font",
	"JetBrainsMono Nerd Font Mono",
	"JetBrainsMono Nerd Font",
	"CaskaydiaCove Nerd Font Mono",
	"CaskaydiaCove Nerd Font",
	"Menlo",
	"Monaco",
	'"Courier New"',
	// SF fonts for Apple tools (swift, xcodebuild) that use SF Symbols private use area characters
	"SF Mono",
	"SF Pro",
	"monospace",
].join(", ");

export const DEFAULT_TERMINAL_FONT_SIZE = 14;
export const TERMINAL_PADDING_PX = 4;

export const TERMINAL_OPTIONS: ITerminalOptions = {
	theme: TERMINAL_THEME,
	fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
	fontSize: DEFAULT_TERMINAL_FONT_SIZE,
	cursorBlink: true,
	cursorStyle: "block",
};
