import type { ITerminalOptions } from "@xterm/xterm";

// Use user's theme
export const TERMINAL_THEME: ITerminalOptions["theme"] = undefined;

// Font family with Nerd Font support for Oh My Posh, Powerlevel10k, Starship, and similar themes.
// Falls back to standard monospace fonts if Nerd Fonts aren't installed.
const TERMINAL_FONT_FAMILY = [
	"MesloLGM Nerd Font", // Recommended by Oh My Posh (Medium line gap)
	"MesloLGM NF",
	"MesloLGS NF", // Recommended by Powerlevel10k (Small line gap)
	"MesloLGS Nerd Font",
	"Hack Nerd Font",
	"FiraCode Nerd Font",
	"JetBrainsMono Nerd Font",
	"CaskaydiaCove Nerd Font", // Popular with Windows Terminal / Starship
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
