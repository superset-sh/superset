import type { Theme } from "../types";
import { toHex } from "../utils";

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
		background: toHex("oklch(0.145 0 0)"),
		foreground: toHex("oklch(0.985 0 0)"),
		card: toHex("oklch(0.205 0 0)"),
		cardForeground: toHex("oklch(0.985 0 0)"),
		popover: toHex("oklch(0.205 0 0)"),
		popoverForeground: toHex("oklch(0.985 0 0)"),
		primary: toHex("oklch(0.985 0 0)"),
		primaryForeground: toHex("oklch(0.205 0 0)"),
		secondary: toHex("oklch(0.269 0 0)"),
		secondaryForeground: toHex("oklch(0.985 0 0)"),
		muted: toHex("oklch(0.269 0 0)"),
		mutedForeground: toHex("oklch(0.708 0 0)"),
		accent: toHex("oklch(0.269 0 0)"),
		accentForeground: toHex("oklch(0.985 0 0)"),
		tertiary: toHex("oklch(0.18 0.005 40)"),
		tertiaryActive: toHex("oklch(0.24 0.005 40)"),
		destructive: toHex("oklch(0.396 0.141 25.723)"),
		destructiveForeground: toHex("oklch(0.637 0.237 25.331)"),
		border: toHex("oklch(0.269 0 0)"),
		input: toHex("oklch(0.269 0 0)"),
		ring: toHex("oklch(0.439 0 0)"),
		sidebar: toHex("oklch(0.205 0 0)"),
		sidebarForeground: toHex("oklch(0.985 0 0)"),
		sidebarPrimary: toHex("oklch(0.488 0.243 264.376)"),
		sidebarPrimaryForeground: toHex("oklch(0.985 0 0)"),
		sidebarAccent: toHex("oklch(0.269 0 0)"),
		sidebarAccentForeground: toHex("oklch(0.985 0 0)"),
		sidebarBorder: toHex("oklch(0.269 0 0)"),
		sidebarRing: toHex("oklch(0.439 0 0)"),
		chart1: toHex("oklch(0.488 0.243 264.376)"),
		chart2: toHex("oklch(0.696 0.17 162.48)"),
		chart3: toHex("oklch(0.769 0.188 70.08)"),
		chart4: toHex("oklch(0.627 0.265 303.9)"),
		chart5: toHex("oklch(0.645 0.246 16.439)"),
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
