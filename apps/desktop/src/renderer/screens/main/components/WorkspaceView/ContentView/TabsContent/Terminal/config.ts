import type { ITerminalOptions } from "@xterm/xterm";

export const TERMINAL_THEME: ITerminalOptions["theme"] = {
	background: "#000000",
	foreground: "#d4d4d4",
	cursor: "#d4d4d4",
	black: "#000000",
	red: "#cd3131",
	green: "#0dbc79",
	yellow: "#e5e510",
	blue: "#2472c8",
	magenta: "#bc3fbc",
	cyan: "#11a8cd",
	white: "#e5e5e5",
	brightBlack: "#666666",
	brightRed: "#f14c4c",
	brightGreen: "#23d18b",
	brightYellow: "#f5f543",
	brightBlue: "#3b8eea",
	brightMagenta: "#d670d6",
	brightCyan: "#29b8db",
	brightWhite: "#e5e5e5",
};

export const TERMINAL_OPTIONS: ITerminalOptions = {
	cursorBlink: true,
	fontSize: 14,
	fontFamily: 'Menlo, Monaco, "Courier New", monospace',
	theme: TERMINAL_THEME,
	allowProposedApi: true,
};

export const RESIZE_DEBOUNCE_MS = 150;
