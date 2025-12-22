import type { Theme } from "../types";

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
		background: "oklch(1 0 0)",
		foreground: "oklch(0.145 0 0)",
		card: "oklch(0.97 0 0)",
		cardForeground: "oklch(0.145 0 0)",
		popover: "oklch(0.97 0 0)",
		popoverForeground: "oklch(0.145 0 0)",
		primary: "oklch(0.205 0 0)",
		primaryForeground: "oklch(0.985 0 0)",
		secondary: "oklch(0.97 0 0)",
		secondaryForeground: "oklch(0.205 0 0)",
		muted: "oklch(0.97 0 0)",
		mutedForeground: "oklch(0.556 0 0)",
		accent: "oklch(0.93 0 0)",
		accentForeground: "oklch(0.205 0 0)",
		tertiary: "oklch(0.95 0.003 40)",
		tertiaryActive: "oklch(0.90 0.003 40)",
		destructive: "oklch(0.577 0.245 27.325)",
		destructiveForeground: "oklch(0.985 0 0)",
		border: "oklch(0.922 0 0)",
		input: "oklch(0.922 0 0)",
		ring: "oklch(0.708 0 0)",
		sidebar: "oklch(0.985 0 0)",
		sidebarForeground: "oklch(0.145 0 0)",
		sidebarPrimary: "oklch(0.205 0 0)",
		sidebarPrimaryForeground: "oklch(0.985 0 0)",
		sidebarAccent: "oklch(0.97 0 0)",
		sidebarAccentForeground: "oklch(0.205 0 0)",
		sidebarBorder: "oklch(0.922 0 0)",
		sidebarRing: "oklch(0.708 0 0)",
		chart1: "oklch(0.646 0.222 41.116)",
		chart2: "oklch(0.6 0.118 184.704)",
		chart3: "oklch(0.398 0.07 227.392)",
		chart4: "oklch(0.828 0.189 84.429)",
		chart5: "oklch(0.769 0.188 70.08)",
	},

	terminal: {
		background: "#fafafa",
		foreground: "#383a42",
		cursor: "#383a42",
		cursorAccent: "#fafafa",
		selectionBackground: "rgba(0, 0, 0, 0.15)",

		// Light terminal palette - all colors visible on light background
		black: "#000000",
		red: "#e45649",
		green: "#50a14f",
		yellow: "#c18401",
		blue: "#0184bc",
		magenta: "#a626a4",
		cyan: "#0997b3",
		white: "#383a42", // Dark - visible on light bg

		// Bright variants - also dark for light bg visibility
		brightBlack: "#4f525e",
		brightRed: "#ca1243",
		brightGreen: "#2e7d32",
		brightYellow: "#986801",
		brightBlue: "#4078f2",
		brightMagenta: "#a626a4",
		brightCyan: "#0184bc",
		brightWhite: "#1e1e1e", // Dark - visible on light bg
	},
};
