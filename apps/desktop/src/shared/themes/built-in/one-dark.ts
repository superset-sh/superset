import type { Theme } from "../types";

/**
 * One Dark Pro theme - Atom editor's popular dark theme
 */
export const oneDarkTheme: Theme = {
	id: "one-dark",
	name: "One Dark Pro",
	author: "Atom",
	type: "dark",
	isBuiltIn: true,
	description: "Atom's iconic One Dark theme",

	ui: {
		background: "#282c34",
		foreground: "#abb2bf",
		card: "#2c313c",
		cardForeground: "#abb2bf",
		popover: "#2c313c",
		popoverForeground: "#abb2bf",
		primary: "#61afef",
		primaryForeground: "#282c34",
		secondary: "#3e4451",
		secondaryForeground: "#abb2bf",
		muted: "#3e4451",
		mutedForeground: "#5c6370",
		accent: "#3e4451",
		accentForeground: "#abb2bf",
		tertiary: "#21252b",
		tertiaryActive: "#2c313c",
		destructive: "#e06c75",
		destructiveForeground: "#282c34",
		border: "#3e4451",
		input: "#3e4451",
		ring: "#61afef",
		sidebar: "#21252b",
		sidebarForeground: "#abb2bf",
		sidebarPrimary: "#61afef",
		sidebarPrimaryForeground: "#282c34",
		sidebarAccent: "#2c313c",
		sidebarAccentForeground: "#abb2bf",
		sidebarBorder: "#3e4451",
		sidebarRing: "#61afef",
		chart1: "#61afef",
		chart2: "#98c379",
		chart3: "#e5c07b",
		chart4: "#c678dd",
		chart5: "#e06c75",

		// Search highlights - blue tint matching one dark's primary
		highlightMatch: "rgba(97, 175, 239, 0.2)",
		highlightActive: "rgba(97, 175, 239, 0.5)",
	},

	terminal: {
		background: "#282c34",
		foreground: "#abb2bf",
		cursor: "#528bff",
		cursorAccent: "#282c34",
		selectionBackground: "rgba(62, 68, 81, 0.6)",

		// One Dark ANSI colors
		black: "#282c34",
		red: "#e06c75",
		green: "#98c379",
		yellow: "#e5c07b",
		blue: "#61afef",
		magenta: "#c678dd",
		cyan: "#56b6c2",
		white: "#abb2bf",

		// Bright variants
		brightBlack: "#5c6370",
		brightRed: "#e06c75",
		brightGreen: "#98c379",
		brightYellow: "#e5c07b",
		brightBlue: "#61afef",
		brightMagenta: "#c678dd",
		brightCyan: "#56b6c2",
		brightWhite: "#ffffff",
	},
};
