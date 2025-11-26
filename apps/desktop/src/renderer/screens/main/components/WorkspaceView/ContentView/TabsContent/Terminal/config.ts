import type { ITerminalOptions } from "@xterm/xterm";

// Use user's theme
export const TERMINAL_THEME: ITerminalOptions["theme"] = undefined;
export const TERMINAL_OPTIONS: ITerminalOptions = {
	cursorBlink: true,
	fontSize: 14,
	fontFamily: 'Menlo, Monaco, "Courier New", monospace',
	theme: TERMINAL_THEME,
	allowProposedApi: true,
};

export const RESIZE_DEBOUNCE_MS = 150;
