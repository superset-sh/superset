import type { ITerminalOptions } from "@xterm/xterm";

// Use user's theme
export const TERMINAL_THEME: ITerminalOptions["theme"] = undefined;

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
	"monospace",
].join(", ");

export const TERMINAL_OPTIONS: ITerminalOptions = {
	cursorBlink: true,
	fontSize: 14,
	fontFamily: TERMINAL_FONT_FAMILY,
	theme: TERMINAL_THEME,
	allowProposedApi: true,
	scrollback: 10000,
	macOptionIsMeta: true,
	cursorStyle: "block",
	cursorInactiveStyle: "outline",
	fastScrollModifier: "alt",
	fastScrollSensitivity: 5,
	screenReaderMode: false,
};

export const RESIZE_DEBOUNCE_MS = 150;
