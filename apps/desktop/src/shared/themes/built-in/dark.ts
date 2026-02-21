import type { Theme } from "../types";

/**
 * Default dark theme - based on the original Superset dark mode colors
 */
export const darkTheme: Theme = {
	id: "dark",
	name: "Dark",
	author: "Superset",
	type: "dark",
	isBuiltIn: true,

	ui: {
		background: "oklch(0.145 0 0)",
		foreground: "oklch(0.985 0 0)",
		card: "oklch(0.205 0 0)",
		cardForeground: "oklch(0.985 0 0)",
		popover: "oklch(0.205 0 0)",
		popoverForeground: "oklch(0.985 0 0)",
		primary: "oklch(0.985 0 0)",
		primaryForeground: "oklch(0.205 0 0)",
		secondary: "oklch(0.269 0 0)",
		secondaryForeground: "oklch(0.985 0 0)",
		muted: "oklch(0.269 0 0)",
		mutedForeground: "oklch(0.708 0 0)",
		accent: "oklch(0.269 0 0)",
		accentForeground: "oklch(0.985 0 0)",
		tertiary: "oklch(0.18 0.005 40)",
		tertiaryActive: "oklch(0.24 0.005 40)",
		destructive: "oklch(0.396 0.141 25.723)",
		destructiveForeground: "oklch(0.637 0.237 25.331)",
		border: "oklch(0.269 0 0)",
		input: "oklch(0.269 0 0)",
		ring: "oklch(0.439 0 0)",
		sidebar: "oklch(0.205 0 0)",
		sidebarForeground: "oklch(0.985 0 0)",
		sidebarPrimary: "oklch(0.488 0.243 264.376)",
		sidebarPrimaryForeground: "oklch(0.985 0 0)",
		sidebarAccent: "oklch(0.269 0 0)",
		sidebarAccentForeground: "oklch(0.985 0 0)",
		sidebarBorder: "oklch(0.269 0 0)",
		sidebarRing: "oklch(0.439 0 0)",
		chart1: "oklch(0.488 0.243 264.376)",
		chart2: "oklch(0.696 0.17 162.48)",
		chart3: "oklch(0.769 0.188 70.08)",
		chart4: "oklch(0.627 0.265 303.9)",
		chart5: "oklch(0.645 0.246 16.439)",

		// Search highlights
		highlightMatch: "#515c6a",
		highlightActive: "rgba(255, 211, 61, 0.4)",
	},

	terminal: {
		background: "#1a1a1a",
		foreground: "#f5f5f5",
		cursor: "#f5f5f5",
		cursorAccent: "#1a1a1a",
		selectionBackground: "rgba(255, 255, 255, 0.2)",

		// Standard ANSI colors
		black: "#1a1a1a",
		red: "#ff5f56",
		green: "#5af78e",
		yellow: "#f3f99d",
		blue: "#57c7ff",
		magenta: "#ff6ac1",
		cyan: "#9aedfe",
		white: "#f1f1f0",

		// Bright ANSI colors
		brightBlack: "#686868",
		brightRed: "#ff6e6e",
		brightGreen: "#69ff94",
		brightYellow: "#ffffa5",
		brightBlue: "#6dccff",
		brightMagenta: "#ff92d0",
		brightCyan: "#a4ffff",
		brightWhite: "#ffffff",
	},
};
