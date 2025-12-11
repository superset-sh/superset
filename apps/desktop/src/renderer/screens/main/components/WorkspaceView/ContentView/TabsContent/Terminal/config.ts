import type { ITerminalOptions } from "@xterm/xterm";

// Use user's theme
export const TERMINAL_THEME: ITerminalOptions["theme"] = undefined;

// Font family with Nerd Font support for Powerlevel10k and similar Zsh themes.
// Falls back to standard monospace fonts if Nerd Fonts aren't installed.
const TERMINAL_FONT_FAMILY = [
	"MesloLGS NF", // Recommended font for Powerlevel10k
	"MesloLGS Nerd Font",
	"Hack Nerd Font",
	"FiraCode Nerd Font",
	"JetBrainsMono Nerd Font",
	"Menlo",
	"Monaco",
	'"Courier New"',
	"monospace",
].join(", ");

export const TERMINAL_OPTIONS: ITerminalOptions = {
	cursorBlink: true,
	fontSize: 14,
	fontFamily: TERMINAL_FONT_FAMILY,
	theme: TERMINAL_THEME,
	allowProposedApi: true,
};

export const RESIZE_DEBOUNCE_MS = 150;
