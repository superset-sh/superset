import type { ITerminalOptions } from "ghostty-web";
import {
	BUNDLED_TERMINAL_FONT_FAMILY,
	BUNDLED_TERMINAL_FONT_SOURCE_FAMILY,
} from "./fonts";

// Use user's theme
export const TERMINAL_THEME: ITerminalOptions["theme"] = undefined;

// Debug logging for terminal lifecycle (enable via localStorage)
// Run in DevTools console: localStorage.setItem('SUPERSET_TERMINAL_DEBUG', '1')
export const DEBUG_TERMINAL =
	typeof localStorage !== "undefined" &&
	localStorage.getItem("SUPERSET_TERMINAL_DEBUG") === "1";

// Use the bundled Nerd Font first so terminal rendering is deterministic.
export const DEFAULT_TERMINAL_FONT_FAMILY = [
	BUNDLED_TERMINAL_FONT_FAMILY,
	BUNDLED_TERMINAL_FONT_SOURCE_FAMILY,
	"MesloLGM Nerd Font Mono",
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
