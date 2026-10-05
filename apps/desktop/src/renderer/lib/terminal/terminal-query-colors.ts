import {
	DEFAULT_TERMINAL_ANSI,
	type TerminalColors,
} from "@superset/shared/terminal-colors";
import type { ITheme } from "@xterm/xterm";

const ANSI_KEYS = [
	"black",
	"red",
	"green",
	"yellow",
	"blue",
	"magenta",
	"cyan",
	"white",
	"brightBlack",
	"brightRed",
	"brightGreen",
	"brightYellow",
	"brightBlue",
	"brightMagenta",
	"brightCyan",
	"brightWhite",
] as const;

export function terminalQueryColors(theme: ITheme): TerminalColors {
	const normalize = (color: string | undefined, fallback: string) => {
		if (color && /^#[\da-f]{3}$/i.test(color))
			return `#${color
				.slice(1)
				.split("")
				.map((c) => c + c)
				.join("")}`;
		if (color && /^#[\da-f]{6}([\da-f]{2})?$/i.test(color))
			return color.slice(0, 7);
		return fallback;
	};
	const background = normalize(theme.background, "#000000");
	let cursor = normalize(theme.cursor, "#ffffff");
	if (theme.cursor && /^#[\da-f]{8}$/i.test(theme.cursor)) {
		const alpha = Number.parseInt(theme.cursor.slice(7), 16) / 255;
		cursor = `#${[1, 3, 5]
			.map((offset) => {
				const bg = Number.parseInt(background.slice(offset, offset + 2), 16);
				const fg = Number.parseInt(cursor.slice(offset, offset + 2), 16);
				return Math.round(bg + (fg - bg) * alpha)
					.toString(16)
					.padStart(2, "0");
			})
			.join("")}`;
	}
	return {
		foreground: normalize(theme.foreground, "#ffffff"),
		background,
		cursor,
		ansi: ANSI_KEYS.map((key, index) =>
			normalize(theme[key], DEFAULT_TERMINAL_ANSI[index] ?? "#000000"),
		),
	};
}
