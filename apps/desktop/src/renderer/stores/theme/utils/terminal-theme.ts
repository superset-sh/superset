import type { ITheme } from "ghostty-web";
import type { TerminalColors } from "shared/themes/types";

/**
 * Convert theme terminal colors to xterm.js ITheme format
 */
export function toXtermTheme(colors: TerminalColors): ITheme {
	return {
		background: colors.background,
		foreground: colors.foreground,
		cursor: colors.cursor,
		cursorAccent: colors.cursorAccent,
		selectionBackground: colors.selectionBackground,
		selectionForeground: colors.selectionForeground,

		// Standard ANSI colors
		black: colors.black,
		red: colors.red,
		green: colors.green,
		yellow: colors.yellow,
		blue: colors.blue,
		magenta: colors.magenta,
		cyan: colors.cyan,
		white: colors.white,

		// Bright ANSI colors
		brightBlack: colors.brightBlack,
		brightRed: colors.brightRed,
		brightGreen: colors.brightGreen,
		brightYellow: colors.brightYellow,
		brightBlue: colors.brightBlue,
		brightMagenta: colors.brightMagenta,
		brightCyan: colors.brightCyan,
		brightWhite: colors.brightWhite,
	};
}
