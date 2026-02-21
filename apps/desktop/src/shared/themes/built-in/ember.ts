import type { Theme } from "../types";

/**
 * Ember theme - Warm dark theme inspired by the Figma start screen design
 * Features a warm, slightly reddish dark background (#151110)
 */
export const emberTheme: Theme = {
	id: "ember",
	name: "Ember",
	author: "Superset",
	type: "dark",
	isBuiltIn: true,

	ui: {
		// Core - warm dark tones
		background: "#151110",
		foreground: "#eae8e6",
		card: "#201E1C",
		cardForeground: "#eae8e6",
		popover: "#201E1C",
		popoverForeground: "#eae8e6",

		// Primary - light foreground for contrast
		primary: "#eae8e6",
		primaryForeground: "#151110",

		// Secondary - warm grays
		secondary: "#2a2827",
		secondaryForeground: "#eae8e6",

		// Muted - subtle warm grays
		muted: "#2a2827",
		mutedForeground: "#a8a5a3",

		// Accent - warm highlight
		accent: "#2a2827",
		accentForeground: "#eae8e6",

		// Tertiary - panel backgrounds
		tertiary: "#1a1716",
		tertiaryActive: "#252220",

		// Destructive - warm red
		destructive: "#cc4444",
		destructiveForeground: "#ffcccc",

		// Borders - subtle warm gray
		border: "#2a2827",
		input: "#2a2827",
		ring: "#3a3837",

		// Sidebar - slightly lighter than background
		sidebar: "#1a1716",
		sidebarForeground: "#eae8e6",
		sidebarPrimary: "#e07850",
		sidebarPrimaryForeground: "#151110",
		sidebarAccent: "#252220",
		sidebarAccentForeground: "#eae8e6",
		sidebarBorder: "#2a2827",
		sidebarRing: "#3a3837",

		// Charts - warm palette
		chart1: "#e07850",
		chart2: "#50a878",
		chart3: "#d4a84b",
		chart4: "#7b68ee",
		chart5: "#dc6b6b",

		// Search highlights - warm orange tint matching ember's accent
		highlightMatch: "rgba(224, 120, 80, 0.2)",
		highlightActive: "rgba(224, 120, 80, 0.5)",
	},

	terminal: {
		background: "#151110",
		foreground: "#eae8e6",
		cursor: "#e07850",
		cursorAccent: "#151110",
		selectionBackground: "rgba(224, 120, 80, 0.25)",

		// Standard ANSI colors - warm tinted
		black: "#151110",
		red: "#dc6b6b",
		green: "#7ec699",
		yellow: "#e5c07b",
		blue: "#61afef",
		magenta: "#c678dd",
		cyan: "#56b6c2",
		white: "#eae8e6",

		// Bright ANSI colors
		brightBlack: "#5c5856",
		brightRed: "#e88888",
		brightGreen: "#98d1a8",
		brightYellow: "#ecd08f",
		brightBlue: "#7ec0f5",
		brightMagenta: "#d494e6",
		brightCyan: "#73c7d3",
		brightWhite: "#ffffff",
	},
};
