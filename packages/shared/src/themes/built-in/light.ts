import type { Theme } from "../types";

export const lightTheme: Theme = {
	id: "light",
	name: "Light",
	author: "Superset",
	type: "light",
	isBuiltIn: true,

	ui: {
		background: "oklch(94.28% 0 0)",
		foreground: "oklch(30.87% 0 0)",

		card: "oklch(97.21% 0 0)",
		cardForeground: "oklch(30.87% 0 0)",

		popover: "oklch(97.21% 0 0)",
		popoverForeground: "oklch(0% 0 0)",

		primary: "oklch(60.21% 0.1823 252.59)",
		primaryForeground: "oklch(100% 0 0)",

		secondary: "oklch(0% 0 0 / 6.27%)",
		secondaryForeground: "oklch(0% 0 0)",

		muted: "oklch(0% 0 0 / 19.22%)",
		mutedForeground: "oklch(55.26% 0 0)",

		accent: "oklch(0% 0 0 / 9.02%)",
		accentForeground: "oklch(20.87% 0 0)",

		tertiary: "oklch(97.21% 0 0)",
		tertiaryActive: "oklch(100% 0 0)",

		destructive: "oklch(61.34% 0.162 23.58)",
		destructiveForeground: "oklch(100% 0 0)",
		warning: "oklch(70.43% 0.14390424619548714 87.9634104985311)",
		warningForeground: "oklch(100% 0 0)",

		border: "oklch(90.67% 0 0)",
		input: "oklch(0% 0 0 / 6.27%)",
		ring: "oklch(60.21% 0.1823 252.59)",

		sidebar: "oklch(94.28% 0 0)",
		sidebarForeground: "oklch(30.87% 0 0)",
		sidebarPrimary: "oklch(60.21% 0.1823 252.59)",
		sidebarPrimaryForeground: "oklch(100% 0 0)",
		sidebarAccent: "oklch(0% 0 0 / 9.02%)",
		sidebarAccentForeground: "oklch(20.87% 0 0)",
		sidebarBorder: "oklch(90.67% 0 0)",
		sidebarRing: "oklch(60.21% 0.1823 252.59)",

		chart1: "#4187c0",
		chart2: "#54935b",
		chart3: "#c28c11",
		chart4: "#886dbc",
		chart5: "#b56455",

		highlightMatch: "rgba(3, 129, 233, 0.22)",
		highlightActive: "rgba(3, 129, 233, 0.45)",

		highlight: "oklch(60.21% 0.1823 252.59)",
		highlightForeground: "oklch(100% 0 0)",
	},

	terminal: {
		background: "oklch(94.28% 0 0)",
		foreground: "oklch(30.87% 0 0)",
		cursor: "#0381e9",
		cursorAccent: "oklch(94.28% 0 0)",
		selectionBackground: "rgba(3, 129, 233, 0.22)",

		black: "#202020",
		red: "#c43a46",
		green: "#54935b",
		yellow: "#976211",
		blue: "#4187c0",
		magenta: "#886dbc",
		cyan: "#1c91a8",
		white: "#8d8d8d",

		brightBlack: "#bbbbbb",
		brightRed: "#d75056",
		brightGreen: "#7b8a34",
		brightYellow: "#c28c11",
		brightBlue: "#3f8ef7",
		brightMagenta: "#a165a1",
		brightCyan: "#2b9684",
		brightWhite: "#cecece",
	},

	editor: {
		syntax: {
			plainText: "oklch(30.87% 0 0)",
			comment: "oklch(55.26% 0 0)",
			keyword: "#ad6e30",
			string: "#1c91a8",
			number: "#7b8a34",
			functionCall: "#b56455",
			variableName: "#886dbc",
			typeName: "#7b8a34",
			className: "#b56455",
			constant: "#7b8a34",
			regexp: "#886dbc",
			tagName: "#886dbc",
			attributeName: "#886dbc",
			invalid: "oklch(61.34% 0.162 23.58)",
		},
	},
};
