import type { TerminalColors } from "shared/themes/types";

/**
 * Diff color theme derived from terminal ANSI colors
 */
export interface DiffColors {
	/** Background for added lines */
	addedBg: string;
	/** Background for added lines on hover */
	addedBgHover: string;
	/** Text color for + indicator */
	addedIndicator: string;
	/** Background for deleted lines */
	deletedBg: string;
	/** Background for deleted lines on hover */
	deletedBgHover: string;
	/** Text color for - indicator */
	deletedIndicator: string;
	/** Background for hunk headers */
	hunkHeaderBg: string;
	/** Text color for hunk headers */
	hunkHeaderText: string;
	/** Line number color */
	lineNumber: string;
}

/**
 * Convert hex color to rgba with alpha
 */
function hexToRgba(hex: string, alpha: number): string {
	// Remove # if present
	const cleanHex = hex.replace("#", "");

	const r = Number.parseInt(cleanHex.slice(0, 2), 16);
	const g = Number.parseInt(cleanHex.slice(2, 4), 16);
	const b = Number.parseInt(cleanHex.slice(4, 6), 16);

	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Create diff colors from terminal ANSI colors
 */
export function createDiffColors(
	terminal: TerminalColors,
	isDark: boolean,
): DiffColors {
	// Alpha values - lighter for dark themes, darker for light themes
	const bgAlpha = isDark ? 0.15 : 0.2;
	const hoverAlpha = isDark ? 0.25 : 0.3;

	return {
		addedBg: hexToRgba(terminal.green, bgAlpha),
		addedBgHover: hexToRgba(terminal.green, hoverAlpha),
		addedIndicator: terminal.green,
		deletedBg: hexToRgba(terminal.red, bgAlpha),
		deletedBgHover: hexToRgba(terminal.red, hoverAlpha),
		deletedIndicator: terminal.red,
		hunkHeaderBg: hexToRgba(terminal.cyan, isDark ? 0.1 : 0.15),
		hunkHeaderText: terminal.cyan,
		lineNumber: terminal.brightBlack,
	};
}

/**
 * Shiki theme token colors mapping from terminal ANSI colors
 */
export interface ShikiThemeTokenColors {
	keyword: string;
	string: string;
	number: string;
	comment: string;
	function: string;
	variable: string;
	type: string;
	operator: string;
	constant: string;
	property: string;
	tag: string;
	attribute: string;
}

/**
 * Create Shiki token colors from terminal ANSI colors
 */
export function createShikiTokenColors(
	terminal: TerminalColors,
): ShikiThemeTokenColors {
	return {
		keyword: terminal.magenta,
		string: terminal.green,
		number: terminal.yellow,
		comment: terminal.brightBlack,
		function: terminal.blue,
		variable: terminal.cyan,
		type: terminal.yellow,
		operator: terminal.foreground,
		constant: terminal.brightMagenta,
		property: terminal.cyan,
		tag: terminal.red,
		attribute: terminal.yellow,
	};
}

/**
 * Create a Shiki TextMate theme from terminal colors
 */
export function createShikiTheme(
	terminal: TerminalColors,
	isDark: boolean,
): {
	name: string;
	type: "dark" | "light";
	colors: Record<string, string>;
	tokenColors: Array<{
		scope: string | string[];
		settings: { foreground?: string; fontStyle?: string };
	}>;
} {
	const tokens = createShikiTokenColors(terminal);

	return {
		name: "superset-dynamic",
		type: isDark ? "dark" : "light",
		colors: {
			"editor.background": terminal.background,
			"editor.foreground": terminal.foreground,
		},
		tokenColors: [
			// Keywords (import, export, const, let, var, function, class, etc.)
			{
				scope: [
					"keyword",
					"keyword.control",
					"keyword.operator.new",
					"storage",
					"storage.type",
					"storage.modifier",
				],
				settings: { foreground: tokens.keyword },
			},
			// Strings
			{
				scope: [
					"string",
					"string.quoted",
					"string.template",
					"punctuation.definition.string",
				],
				settings: { foreground: tokens.string },
			},
			// Numbers
			{
				scope: ["constant.numeric", "constant.language.boolean"],
				settings: { foreground: tokens.number },
			},
			// Comments
			{
				scope: ["comment", "punctuation.definition.comment"],
				settings: { foreground: tokens.comment, fontStyle: "italic" },
			},
			// Functions
			{
				scope: [
					"entity.name.function",
					"support.function",
					"meta.function-call",
				],
				settings: { foreground: tokens.function },
			},
			// Variables and parameters
			{
				scope: [
					"variable",
					"variable.other",
					"variable.parameter",
					"meta.definition.variable",
				],
				settings: { foreground: tokens.variable },
			},
			// Types and classes
			{
				scope: [
					"entity.name.type",
					"entity.name.class",
					"support.type",
					"support.class",
				],
				settings: { foreground: tokens.type },
			},
			// Operators
			{
				scope: ["keyword.operator", "punctuation"],
				settings: { foreground: tokens.operator },
			},
			// Constants
			{
				scope: ["constant.language", "constant.other"],
				settings: { foreground: tokens.constant },
			},
			// Properties
			{
				scope: [
					"variable.other.property",
					"support.type.property-name",
					"entity.name.tag.yaml",
				],
				settings: { foreground: tokens.property },
			},
			// HTML/JSX tags
			{
				scope: ["entity.name.tag", "support.class.component"],
				settings: { foreground: tokens.tag },
			},
			// Attributes
			{
				scope: ["entity.other.attribute-name"],
				settings: { foreground: tokens.attribute },
			},
			// JSON keys
			{
				scope: ["support.type.property-name.json"],
				settings: { foreground: tokens.property },
			},
			// Markdown headings
			{
				scope: ["markup.heading", "entity.name.section"],
				settings: { foreground: tokens.function },
			},
			// Markdown bold/italic
			{
				scope: ["markup.bold"],
				settings: { fontStyle: "bold" },
			},
			{
				scope: ["markup.italic"],
				settings: { fontStyle: "italic" },
			},
		],
	};
}
