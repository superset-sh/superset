import type { Theme } from "../types";

export const darkTheme: Theme = {
	id: "dark",
	name: "Dark",
	author: "Superset",
	type: "dark",
	isBuiltIn: true,

	ui: {
		background: "oklch(21.34% 0 0)",
		foreground: "oklch(85.8% 0 0)",

		card: "oklch(25.2% 0 0)",
		cardForeground: "oklch(92.8% 0 0)",

		popover: "oklch(25.2% 0 0)",
		popoverForeground: "oklch(92.8% 0 0)",

		primary: "oklch(60.21% 0.1823 252.59)",
		primaryForeground: "oklch(92.8% 0 0)",

		secondary: "oklch(100% 0 0 / 7.06%)",
		secondaryForeground: "oklch(92.8% 0 0)",

		muted: "oklch(100% 0 0 / 13.33%)",
		mutedForeground: "oklch(76.99% 0 0)",

		accent: "oklch(100% 0 0 / 10.59%)",
		accentForeground: "oklch(98.8% 0 0)",

		tertiary: "oklch(25.2% 0 0)",
		tertiaryActive: "oklch(28.5% 0 0)",

		destructive: "oklch(61.34% 0.162 23.58)",
		destructiveForeground: "oklch(100% 0 0)",
		warning: "oklch(70.43% 0.14390424619548714 87.9634104985311)",
		warningForeground: "oklch(100% 0 0)",

		border: "oklch(31.32% 0 0)",
		input: "oklch(100% 0 0 / 10.59%)",
		ring: "oklch(60.21% 0.1823 252.59)",

		sidebar: "oklch(21.34% 0 0)",
		sidebarForeground: "oklch(85.8% 0 0)",
		sidebarPrimary: "oklch(60.21% 0.1823 252.59)",
		sidebarPrimaryForeground: "oklch(92.8% 0 0)",
		sidebarAccent: "oklch(100% 0 0 / 10.59%)",
		sidebarAccentForeground: "oklch(98.8% 0 0)",
		sidebarBorder: "oklch(31.32% 0 0)",
		sidebarRing: "oklch(60.21% 0.1823 252.59)",

		chart1: "#4187c0",
		chart2: "#54935b",
		chart3: "#c28c11",
		chart4: "#886dbc",
		chart5: "#b56455",

		highlightMatch: "rgba(3, 129, 233, 0.28)",
		highlightActive: "rgba(3, 129, 233, 0.55)",

		highlight: "oklch(60.21% 0.1823 252.59)",
		highlightForeground: "oklch(100% 0 0)",
	},

	terminal: {
		background: "oklch(21.34% 0 0)",
		foreground: "oklch(85.8% 0 0)",
		cursor: "#0381e9",
		cursorAccent: "oklch(21.34% 0 0)",
		selectionBackground: "rgba(3, 129, 233, 0.28)",

		black: "#191919",
		red: "#d75056",
		green: "#54935b",
		yellow: "#c28c11",
		blue: "#4187c0",
		magenta: "#886dbc",
		cyan: "#1c91a8",
		white: "#b4b4b4",

		brightBlack: "#606060",
		brightRed: "#e78587",
		brightGreen: "#7dc599",
		brightYellow: "#ebc724",
		brightBlue: "#77b8f0",
		brightMagenta: "#a165a1",
		brightCyan: "#62c4cc",
		brightWhite: "#eeeeee",
	},

	editor: {
		syntax: {
			plainText: "oklch(85.8% 0 0)",
			comment: "oklch(76.99% 0 0)",
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
