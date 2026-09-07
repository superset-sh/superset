import type { Theme } from "../types";

/**
 * Solarized Light - Ethan Schoonover's precision palette, light variant
 */
export const solarizedLightTheme: Theme = {
	id: "solarized-light",
	name: "Solarized Light",
	author: "Ethan Schoonover (port: Baris Can Sayin)",
	type: "light",
	isBuiltIn: true,
	description:
		"Precision colors engineered for legibility. Cream paper base, ink foreground, same accent hues as Solarized Dark.",

	ui: {
		background: "#fdf6e3",
		foreground: "#586e75",
		card: "#eee8d5",
		cardForeground: "#073642",
		popover: "#eee8d5",
		popoverForeground: "#073642",
		primary: "#268bd2",
		primaryForeground: "#002b36",
		secondary: "#eee8d5",
		secondaryForeground: "#657b83",
		muted: "#eee8d5",
		// base00 rather than base1: base1 lands under 2.5:1 on the cream
		// background, too faint for the secondary text this token drives.
		mutedForeground: "#657b83",
		accent: "#eee8d5",
		accentForeground: "#073642",
		tertiary: "#f5eecb",
		tertiaryActive: "#eee8d5",
		destructive: "#dc322f",
		destructiveForeground: "#fdf6e3",
		warning: "#895900",
		warningForeground: "#ffffff",
		success: "#859900",
		border: "#eee8d5",
		input: "#eee8d5",
		ring: "#268bd2",
		sidebar: "#f5eecb",
		sidebarForeground: "#657b83",
		sidebarPrimary: "#268bd2",
		sidebarPrimaryForeground: "#002b36",
		sidebarAccent: "#eee8d5",
		sidebarAccentForeground: "#073642",
		sidebarBorder: "#eee8d5",
		sidebarRing: "#268bd2",
		chart1: "#dc322f",
		chart2: "#859900",
		chart3: "#2aa198",
		chart4: "#b58900",
		chart5: "#6c71c4",

		// Search highlights - Solarized yellow tint
		highlightMatch: "rgba(181, 137, 0, 0.18)",
		highlightActive: "rgba(181, 137, 0, 0.4)",

		// Brand highlight - Solarized yellow
		highlight: "#b58900",
		highlightForeground: "#fdf6e3",
	},

	terminal: {
		background: "#fdf6e3",
		foreground: "#657b83",
		cursor: "#586e75",
		cursorAccent: "#fdf6e3",
		selectionBackground: "rgba(238, 232, 213, 0.95)",

		// Solarized accent colors
		black: "#073642",
		red: "#dc322f",
		green: "#859900",
		yellow: "#b58900",
		blue: "#268bd2",
		magenta: "#d33682",
		cyan: "#2aa198",
		white: "#eee8d5",

		// Solarized maps the bright slots to its base tones
		brightBlack: "#002b36",
		brightRed: "#cb4b16",
		brightGreen: "#586e75",
		brightYellow: "#657b83",
		brightBlue: "#839496",
		brightMagenta: "#6c71c4",
		brightCyan: "#93a1a1",
		brightWhite: "#fdf6e3",
	},

	editor: {
		syntax: {
			// base1: Solarized's comment tone in the light variant
			comment: "#93a1a1",
		},
	},
};
