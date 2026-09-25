import type { ITheme } from "@xterm/xterm";
import type { TerminalColors } from "shared/themes/types";
import { toHexAuto } from "shared/themes/utils";

const CANONICAL_HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

/**
 * xterm's WebGL renderer rasterises the shade blocks ░ ▒ ▓ by reading the fill
 * colour back off the canvas as a string, and it parses only hex and `rgba()`.
 * A theme colour in any other notation throws mid-frame, so normalise every
 * colour here. Colours that cannot be parsed are dropped, leaving xterm to use
 * its own default for that slot rather than forwarding a string that crashes.
 */
function toXtermColor(color: string | undefined): string | undefined {
	if (color === undefined) {
		return undefined;
	}
	const hex = toHexAuto(color);
	return CANONICAL_HEX.test(hex) ? hex : undefined;
}

/**
 * Convert theme terminal colors to xterm.js ITheme format
 */
export function toXtermTheme(colors: TerminalColors): ITheme {
	return {
		background: toXtermColor(colors.background),
		foreground: toXtermColor(colors.foreground),
		cursor: toXtermColor(colors.cursor),
		cursorAccent: toXtermColor(colors.cursorAccent),
		selectionBackground: toXtermColor(colors.selectionBackground),
		selectionForeground: toXtermColor(colors.selectionForeground),

		// Standard ANSI colors
		black: toXtermColor(colors.black),
		red: toXtermColor(colors.red),
		green: toXtermColor(colors.green),
		yellow: toXtermColor(colors.yellow),
		blue: toXtermColor(colors.blue),
		magenta: toXtermColor(colors.magenta),
		cyan: toXtermColor(colors.cyan),
		white: toXtermColor(colors.white),

		// Bright ANSI colors
		brightBlack: toXtermColor(colors.brightBlack),
		brightRed: toXtermColor(colors.brightRed),
		brightGreen: toXtermColor(colors.brightGreen),
		brightYellow: toXtermColor(colors.brightYellow),
		brightBlue: toXtermColor(colors.brightBlue),
		brightMagenta: toXtermColor(colors.brightMagenta),
		brightCyan: toXtermColor(colors.brightCyan),
		brightWhite: toXtermColor(colors.brightWhite),
	};
}
