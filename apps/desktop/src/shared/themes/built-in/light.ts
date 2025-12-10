import type { Theme } from "../types";
import { toHex } from "../utils";

/**
 * Light theme - based on the original Superset light mode colors
 */
export const lightTheme: Theme = {
	id: "light",
	name: "Light",
	author: "Superset",
	type: "light",
	isBuiltIn: true,

	ui: {
		background: toHex("oklch(1 0 0)"),
		foreground: toHex("oklch(0.145 0 0)"),
		card: toHex("oklch(0.97 0 0)"),
		cardForeground: toHex("oklch(0.145 0 0)"),
		popover: toHex("oklch(0.97 0 0)"),
		popoverForeground: toHex("oklch(0.145 0 0)"),
		primary: toHex("oklch(0.205 0 0)"),
		primaryForeground: toHex("oklch(0.985 0 0)"),
		secondary: toHex("oklch(0.97 0 0)"),
		secondaryForeground: toHex("oklch(0.205 0 0)"),
		muted: toHex("oklch(0.97 0 0)"),
		mutedForeground: toHex("oklch(0.556 0 0)"),
		accent: toHex("oklch(0.93 0 0)"),
		accentForeground: toHex("oklch(0.205 0 0)"),
		tertiary: toHex("oklch(0.95 0.003 40)"),
		tertiaryActive: toHex("oklch(0.90 0.003 40)"),
		destructive: toHex("oklch(0.577 0.245 27.325)"),
		destructiveForeground: toHex("oklch(0.985 0 0)"),
		border: toHex("oklch(0.922 0 0)"),
		input: toHex("oklch(0.922 0 0)"),
		ring: toHex("oklch(0.708 0 0)"),
		sidebar: toHex("oklch(0.985 0 0)"),
		sidebarForeground: toHex("oklch(0.145 0 0)"),
		sidebarPrimary: toHex("oklch(0.205 0 0)"),
		sidebarPrimaryForeground: toHex("oklch(0.985 0 0)"),
		sidebarAccent: toHex("oklch(0.97 0 0)"),
		sidebarAccentForeground: toHex("oklch(0.205 0 0)"),
		sidebarBorder: toHex("oklch(0.922 0 0)"),
		sidebarRing: toHex("oklch(0.708 0 0)"),
		chart1: toHex("oklch(0.646 0.222 41.116)"),
		chart2: toHex("oklch(0.6 0.118 184.704)"),
		chart3: toHex("oklch(0.398 0.07 227.392)"),
		chart4: toHex("oklch(0.828 0.189 84.429)"),
		chart5: toHex("oklch(0.769 0.188 70.08)"),
	},

	terminal: {
		background: "#ffffff",
		foreground: "#333333",
		cursor: "#333333",
		cursorAccent: "#ffffff",
		selectionBackground: "rgba(0, 0, 0, 0.15)",

		// Standard ANSI colors
		black: "#000000",
		red: "#c91b00",
		green: "#00c200",
		yellow: "#c7c400",
		blue: "#0225c7",
		magenta: "#c930c7",
		cyan: "#00c5c7",
		white: "#c7c7c7",

		// Bright ANSI colors
		brightBlack: "#686868",
		brightRed: "#ff6e6e",
		brightGreen: "#5ffa68",
		brightYellow: "#fffc67",
		brightBlue: "#6871ff",
		brightMagenta: "#ff77ff",
		brightCyan: "#5ffdff",
		brightWhite: "#ffffff",
	},
};
