import { COMPANY } from "@superset/shared/constants";

export interface ThemeListing {
	slug: string;
	name: string;
	type: "dark" | "light";
	author: string;
	submittedBy: string;
	description: string;
	addedOn: string;
	source: {
		label: string;
		href: string;
	};
	tags: string[];
	ui: {
		background: string;
		foreground: string;
		card: string;
		cardForeground: string;
		primary: string;
		accent: string;
		border: string;
		sidebar: string;
		sidebarForeground: string;
	};
	terminal: {
		background: string;
		foreground: string;
		cursor: string;
		red: string;
		green: string;
		yellow: string;
		blue: string;
		magenta: string;
		cyan: string;
	};
}

export const themeListings: ThemeListing[] = [
	{
		slug: "github-dark-colorblind",
		name: "GitHub Dark Colorblind",
		type: "dark",
		author: "GitHub (primer/github-vscode-theme)",
		submittedBy: "tkcel",
		description:
			"A GitHub-inspired dark theme adapted for Superset with strong blue, amber, and green contrast.",
		addedOn: "March 26, 2026",
		source: {
			label: "Download",
			href: "/marketplace/themes/github-dark-colorblind.json",
		},
		tags: ["GitHub", "Dark", "High contrast"],
		ui: {
			background: "#0d1117",
			foreground: "#e6edf3",
			card: "#161b22",
			cardForeground: "#e6edf3",
			primary: "#2f81f7",
			accent: "#1f6feb",
			border: "#30363d",
			sidebar: "#010409",
			sidebarForeground: "#e6edf3",
		},
		terminal: {
			background: "#0d1117",
			foreground: "#e6edf3",
			cursor: "#2f81f7",
			red: "#ff7b72",
			green: "#3fb950",
			yellow: "#d29922",
			blue: "#58a6ff",
			magenta: "#bc8cff",
			cyan: "#39c5cf",
		},
	},
	{
		slug: "catppuccin-mocha",
		name: "Catppuccin Mocha",
		type: "dark",
		author: "Catppuccin",
		submittedBy: "tamarazuk",
		description: "The Mocha variant from the Catppuccin theme PR for Superset.",
		addedOn: "March 21, 2026",
		source: {
			label: "Download",
			href: "/marketplace/themes/catppuccin-mocha.json",
		},
		tags: ["Catppuccin", "Dark"],
		ui: {
			background: "#1e1e2e",
			foreground: "#cdd6f4",
			card: "#181825",
			cardForeground: "#cdd6f4",
			primary: "#cba6f7",
			accent: "#45475a",
			border: "#45475a",
			sidebar: "#181825",
			sidebarForeground: "#cdd6f4",
		},
		terminal: {
			background: "#1e1e2e",
			foreground: "#cdd6f4",
			cursor: "#f5e0dc",
			red: "#f38ba8",
			green: "#a6e3a1",
			yellow: "#f9e2af",
			blue: "#89b4fa",
			magenta: "#f5c2e7",
			cyan: "#89dceb",
		},
	},
	{
		slug: "catppuccin-macchiato",
		name: "Catppuccin Macchiato",
		type: "dark",
		author: "Catppuccin",
		submittedBy: "tamarazuk",
		description:
			"The Macchiato variant from the Catppuccin theme PR for Superset.",
		addedOn: "March 21, 2026",
		source: {
			label: "Download",
			href: "/marketplace/themes/catppuccin-macchiato.json",
		},
		tags: ["Catppuccin", "Dark"],
		ui: {
			background: "#24273a",
			foreground: "#cad3f5",
			card: "#1e2030",
			cardForeground: "#cad3f5",
			primary: "#c6a0f6",
			accent: "#494d64",
			border: "#494d64",
			sidebar: "#1e2030",
			sidebarForeground: "#cad3f5",
		},
		terminal: {
			background: "#24273a",
			foreground: "#cad3f5",
			cursor: "#f4dbd6",
			red: "#ed8796",
			green: "#a6da95",
			yellow: "#eed49f",
			blue: "#8aadf4",
			magenta: "#f5bde6",
			cyan: "#91d7e3",
		},
	},
	{
		slug: "catppuccin-frappe",
		name: "Catppuccin Frappé",
		type: "dark",
		author: "Catppuccin",
		submittedBy: "tamarazuk",
		description:
			"The Frappé variant from the Catppuccin theme PR for Superset.",
		addedOn: "March 21, 2026",
		source: {
			label: "Download",
			href: "/marketplace/themes/catppuccin-frappe.json",
		},
		tags: ["Catppuccin", "Dark"],
		ui: {
			background: "#303446",
			foreground: "#c6d0f5",
			card: "#292c3c",
			cardForeground: "#c6d0f5",
			primary: "#ca9ee6",
			accent: "#51576d",
			border: "#51576d",
			sidebar: "#292c3c",
			sidebarForeground: "#c6d0f5",
		},
		terminal: {
			background: "#303446",
			foreground: "#c6d0f5",
			cursor: "#f2d5cf",
			red: "#e78284",
			green: "#a6d189",
			yellow: "#e5c890",
			blue: "#8caaee",
			magenta: "#f4b8e4",
			cyan: "#99d1db",
		},
	},
	{
		slug: "catppuccin-latte",
		name: "Catppuccin Latte",
		type: "light",
		author: "Catppuccin",
		submittedBy: "tamarazuk",
		description: "The Latte variant from the Catppuccin theme PR for Superset.",
		addedOn: "March 21, 2026",
		source: {
			label: "Download",
			href: "/marketplace/themes/catppuccin-latte.json",
		},
		tags: ["Catppuccin", "Light"],
		ui: {
			background: "#eff1f5",
			foreground: "#4c4f69",
			card: "#e6e9ef",
			cardForeground: "#4c4f69",
			primary: "#8839ef",
			accent: "#bcc0cc",
			border: "#bcc0cc",
			sidebar: "#e6e9ef",
			sidebarForeground: "#4c4f69",
		},
		terminal: {
			background: "#eff1f5",
			foreground: "#4c4f69",
			cursor: "#dc8a78",
			red: "#d20f39",
			green: "#40a02b",
			yellow: "#df8e1d",
			blue: "#1e66f5",
			magenta: "#ea76cb",
			cyan: "#04a5e5",
		},
	},
	{
		slug: "ember",
		name: "Ember",
		type: "dark",
		author: "Superset",
		submittedBy: "AviPeltz",
		description:
			"The standalone Ember theme introduced before its palette became the default Dark theme.",
		addedOn: "December 1, 2025",
		source: {
			label: "Download",
			href: "/marketplace/themes/ember.json",
		},
		tags: ["Superset", "Dark", "Warm"],
		ui: {
			background: "#151110",
			foreground: "#eae8e6",
			card: "#201E1C",
			cardForeground: "#eae8e6",
			primary: "#eae8e6",
			accent: "#2a2827",
			border: "#2a2827",
			sidebar: "#1a1716",
			sidebarForeground: "#eae8e6",
		},
		terminal: {
			background: "#151110",
			foreground: "#eae8e6",
			cursor: "#e07850",
			red: "#dc6b6b",
			green: "#7ec699",
			yellow: "#e5c07b",
			blue: "#61afef",
			magenta: "#c678dd",
			cyan: "#56b6c2",
		},
	},
	{
		slug: "monokai-classic",
		name: "Monokai Classic",
		type: "dark",
		author: "Wimer Hazenberg",
		submittedBy: "AviPeltz",
		description:
			"The Monokai palette from the original desktop themes PR, exported with an import-safe marketplace ID.",
		addedOn: "November 27, 2025",
		source: {
			label: "Download",
			href: "/marketplace/themes/monokai-classic.json",
		},
		tags: ["Monokai", "Dark"],
		ui: {
			background: "#272822",
			foreground: "#f8f8f2",
			card: "#3e3d32",
			cardForeground: "#f8f8f2",
			primary: "#a6e22e",
			accent: "#49483e",
			border: "#49483e",
			sidebar: "#1e1f1c",
			sidebarForeground: "#f8f8f2",
		},
		terminal: {
			background: "#272822",
			foreground: "#f8f8f2",
			cursor: "#f8f8f2",
			red: "#f92672",
			green: "#a6e22e",
			yellow: "#f4bf75",
			blue: "#66d9ef",
			magenta: "#ae81ff",
			cyan: "#a1efe4",
		},
	},
	{
		slug: "one-dark-pro",
		name: "One Dark Pro",
		type: "dark",
		author: "Atom",
		submittedBy: "AviPeltz",
		description:
			"The original One Dark Pro theme from the first desktop themes PR, preserved as an importable file.",
		addedOn: "November 27, 2025",
		source: {
			label: "Download",
			href: "/marketplace/themes/one-dark-pro.json",
		},
		tags: ["Atom", "Dark"],
		ui: {
			background: "#282c34",
			foreground: "#abb2bf",
			card: "#2c313c",
			cardForeground: "#abb2bf",
			primary: "#61afef",
			accent: "#3e4451",
			border: "#3e4451",
			sidebar: "#21252b",
			sidebarForeground: "#abb2bf",
		},
		terminal: {
			background: "#282c34",
			foreground: "#abb2bf",
			cursor: "#528bff",
			red: "#e06c75",
			green: "#98c379",
			yellow: "#e5c07b",
			blue: "#61afef",
			magenta: "#c678dd",
			cyan: "#56b6c2",
		},
	},
];

function buildIssueUrl(title: string) {
	return `${COMPANY.REPORT_ISSUE_URL}?title=${encodeURIComponent(title)}`;
}

export const marketplaceSubmissionLinks = {
	theme: buildIssueUrl("[Marketplace] Theme submission"),
	agent: buildIssueUrl("[Marketplace] Agent config submission"),
};
