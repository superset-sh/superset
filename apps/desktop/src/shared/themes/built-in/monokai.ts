import type { Theme } from "../types";

/**
 * Monokai theme - Sublime Text's classic color scheme
 */
export const monokaiTheme: Theme = {
	id: "monokai",
	name: "Monokai",
	author: "Wimer Hazenberg",
	type: "dark",
	isBuiltIn: true,
	description: "Sublime Text's iconic dark theme",

	ui: {
		background: "#272822",
		foreground: "#f8f8f2",
		card: "#3e3d32",
		cardForeground: "#f8f8f2",
		popover: "#3e3d32",
		popoverForeground: "#f8f8f2",
		primary: "#a6e22e",
		primaryForeground: "#272822",
		secondary: "#3e3d32",
		secondaryForeground: "#f8f8f2",
		muted: "#3e3d32",
		mutedForeground: "#75715e",
		accent: "#49483e",
		accentForeground: "#f8f8f2",
		tertiary: "#1e1f1c",
		tertiaryActive: "#3e3d32",
		destructive: "#f92672",
		destructiveForeground: "#f8f8f2",
		border: "#49483e",
		input: "#49483e",
		ring: "#a6e22e",
		sidebar: "#1e1f1c",
		sidebarForeground: "#f8f8f2",
		sidebarPrimary: "#a6e22e",
		sidebarPrimaryForeground: "#272822",
		sidebarAccent: "#3e3d32",
		sidebarAccentForeground: "#f8f8f2",
		sidebarBorder: "#49483e",
		sidebarRing: "#a6e22e",
		chart1: "#f92672",
		chart2: "#a6e22e",
		chart3: "#66d9ef",
		chart4: "#f4bf75",
		chart5: "#ae81ff",

		// Search highlights - warm yellow matching monokai's palette
		highlightMatch: "rgba(244, 191, 117, 0.25)",
		highlightActive: "rgba(244, 191, 117, 0.55)",
	},

	terminal: {
		background: "#272822",
		foreground: "#f8f8f2",
		cursor: "#f8f8f2",
		cursorAccent: "#272822",
		selectionBackground: "rgba(73, 72, 62, 0.6)",

		// Monokai ANSI colors
		black: "#272822",
		red: "#f92672",
		green: "#a6e22e",
		yellow: "#f4bf75",
		blue: "#66d9ef",
		magenta: "#ae81ff",
		cyan: "#a1efe4",
		white: "#f8f8f2",

		// Bright variants
		brightBlack: "#75715e",
		brightRed: "#f92672",
		brightGreen: "#a6e22e",
		brightYellow: "#f4bf75",
		brightBlue: "#66d9ef",
		brightMagenta: "#ae81ff",
		brightCyan: "#a1efe4",
		brightWhite: "#f9f8f5",
	},
};
