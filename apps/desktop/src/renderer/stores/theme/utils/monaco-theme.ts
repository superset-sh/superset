import { formatHex8, formatHex, parse } from "culori";
import type { editor } from "monaco-editor";
import type { TerminalColors, Theme } from "shared/themes/types";

/**
 * Monaco editor theme definition
 */
export interface MonacoTheme {
	base: "vs" | "vs-dark" | "hc-black";
	inherit: boolean;
	rules: editor.ITokenThemeRule[];
	colors: editor.IColors;
}

/**
 * Convert any color to hex format for Monaco
 * Monaco only accepts hex colors (#RRGGBB or #RRGGBBAA)
 */
function toMonacoHex(color: string): string {
	const parsed = parse(color);
	if (!parsed) {
		return color;
	}
	// Use formatHex8 if alpha is present and not 1, otherwise formatHex
	if (parsed.alpha !== undefined && parsed.alpha < 1) {
		return formatHex8(parsed);
	}
	return formatHex(parsed);
}

/**
 * Apply alpha transparency to a color and return as hex for Monaco
 */
function applyAlpha(color: string, alpha: number): string {
	const parsed = parse(color);
	if (!parsed) {
		return color;
	}
	parsed.alpha = alpha;
	return formatHex8(parsed);
}

/**
 * Convert theme terminal colors to Monaco editor token rules
 * Maps ANSI colors to syntax highlighting rules
 */
function createTokenRules(colors: TerminalColors): editor.ITokenThemeRule[] {
	return [
		// Comments
		{ token: "comment", foreground: colors.brightBlack.replace("#", "") },
		{ token: "comment.line", foreground: colors.brightBlack.replace("#", "") },
		{ token: "comment.block", foreground: colors.brightBlack.replace("#", "") },

		// Strings
		{ token: "string", foreground: colors.green.replace("#", "") },
		{ token: "string.quoted", foreground: colors.green.replace("#", "") },
		{ token: "string.template", foreground: colors.green.replace("#", "") },

		// Keywords
		{ token: "keyword", foreground: colors.magenta.replace("#", "") },
		{ token: "keyword.control", foreground: colors.magenta.replace("#", "") },
		{ token: "keyword.operator", foreground: colors.red.replace("#", "") },
		{ token: "storage", foreground: colors.magenta.replace("#", "") },
		{ token: "storage.type", foreground: colors.cyan.replace("#", "") },

		// Numbers
		{ token: "number", foreground: colors.yellow.replace("#", "") },
		{ token: "constant.numeric", foreground: colors.yellow.replace("#", "") },

		// Constants
		{ token: "constant", foreground: colors.yellow.replace("#", "") },
		{ token: "constant.language", foreground: colors.yellow.replace("#", "") },
		{ token: "constant.character", foreground: colors.yellow.replace("#", "") },

		// Variables
		{ token: "variable", foreground: colors.foreground.replace("#", "") },
		{
			token: "variable.parameter",
			foreground: colors.foreground.replace("#", ""),
		},
		{ token: "variable.other", foreground: colors.foreground.replace("#", "") },

		// Functions
		{ token: "entity.name.function", foreground: colors.blue.replace("#", "") },
		{ token: "support.function", foreground: colors.blue.replace("#", "") },
		{ token: "meta.function-call", foreground: colors.blue.replace("#", "") },

		// Types/Classes
		{ token: "entity.name.type", foreground: colors.cyan.replace("#", "") },
		{ token: "entity.name.class", foreground: colors.cyan.replace("#", "") },
		{ token: "support.type", foreground: colors.cyan.replace("#", "") },
		{ token: "support.class", foreground: colors.cyan.replace("#", "") },

		// Tags (JSX/HTML)
		{ token: "entity.name.tag", foreground: colors.red.replace("#", "") },
		{ token: "tag", foreground: colors.red.replace("#", "") },
		{ token: "meta.tag", foreground: colors.red.replace("#", "") },

		// Attributes
		{
			token: "entity.other.attribute-name",
			foreground: colors.yellow.replace("#", ""),
		},
		{ token: "attribute.name", foreground: colors.yellow.replace("#", "") },

		// Operators
		{ token: "keyword.operator", foreground: colors.red.replace("#", "") },
		{ token: "punctuation", foreground: colors.foreground.replace("#", "") },

		// TypeScript/JavaScript specific
		{ token: "type", foreground: colors.cyan.replace("#", "") },
		{ token: "type.identifier", foreground: colors.cyan.replace("#", "") },
		{ token: "identifier", foreground: colors.foreground.replace("#", "") },
		{ token: "delimiter", foreground: colors.foreground.replace("#", "") },

		// JSON
		{ token: "string.key.json", foreground: colors.red.replace("#", "") },
		{ token: "string.value.json", foreground: colors.green.replace("#", "") },

		// Regex
		{ token: "regexp", foreground: colors.cyan.replace("#", "") },

		// Markdown
		{
			token: "markup.heading",
			foreground: colors.red.replace("#", ""),
			fontStyle: "bold",
		},
		{
			token: "markup.bold",
			foreground: colors.yellow.replace("#", ""),
			fontStyle: "bold",
		},
		{
			token: "markup.italic",
			foreground: colors.magenta.replace("#", ""),
			fontStyle: "italic",
		},
		{ token: "markup.inline.raw", foreground: colors.green.replace("#", "") },
	];
}

/**
 * Convert theme to Monaco editor colors
 * Uses terminal colors for editor background to match xterm
 */
function createEditorColors(theme: Theme): editor.IColors {
	const { terminal, ui } = theme;

	// Get selection background with fallback, convert to hex for Monaco
	const selectionBg = terminal.selectionBackground
		? toMonacoHex(terminal.selectionBackground)
		: applyAlpha(terminal.foreground, 0.2);

	return {
		// Editor background matches terminal
		"editor.background": terminal.background,
		"editor.foreground": terminal.foreground,

		// Line highlights
		"editor.lineHighlightBackground": ui.accent,
		"editor.lineHighlightBorder": "#00000000",

		// Selection - use applyAlpha for proper color format handling
		"editor.selectionBackground": selectionBg,
		"editor.selectionHighlightBackground": applyAlpha(terminal.blue, 0.2),
		"editor.inactiveSelectionBackground": applyAlpha(terminal.foreground, 0.1),

		// Find matches
		"editor.findMatchBackground": applyAlpha(terminal.yellow, 0.27),
		"editor.findMatchHighlightBackground": applyAlpha(terminal.yellow, 0.13),

		// Gutter (line numbers)
		"editorLineNumber.foreground": terminal.brightBlack,
		"editorLineNumber.activeForeground": terminal.foreground,
		"editorGutter.background": terminal.background,

		// Cursor
		"editorCursor.foreground": terminal.cursor,

		// Diff colors - use semantic colors
		"diffEditor.insertedTextBackground": applyAlpha(terminal.green, 0.13),
		"diffEditor.removedTextBackground": applyAlpha(terminal.red, 0.13),
		"diffEditor.insertedLineBackground": applyAlpha(terminal.green, 0.08),
		"diffEditor.removedLineBackground": applyAlpha(terminal.red, 0.08),
		"diffEditorGutter.insertedLineBackground": applyAlpha(terminal.green, 0.2),
		"diffEditorGutter.removedLineBackground": applyAlpha(terminal.red, 0.2),
		"diffEditor.diagonalFill": ui.border,

		// Scrollbar
		"scrollbar.shadow": "#00000000",
		"scrollbarSlider.background": applyAlpha(terminal.foreground, 0.13),
		"scrollbarSlider.hoverBackground": applyAlpha(terminal.foreground, 0.2),
		"scrollbarSlider.activeBackground": applyAlpha(terminal.foreground, 0.27),

		// Widget (autocomplete, etc.)
		"editorWidget.background": ui.popover,
		"editorWidget.foreground": ui.popoverForeground,
		"editorWidget.border": ui.border,

		// Bracket matching
		"editorBracketMatch.background": applyAlpha(terminal.cyan, 0.2),
		"editorBracketMatch.border": terminal.cyan,

		// Indent guides
		"editorIndentGuide.background": applyAlpha(terminal.foreground, 0.08),
		"editorIndentGuide.activeBackground": applyAlpha(terminal.foreground, 0.2),

		// Whitespace
		"editorWhitespace.foreground": applyAlpha(terminal.foreground, 0.13),

		// Overview ruler (minimap side)
		"editorOverviewRuler.border": "#00000000",
	};
}

/**
 * Convert app theme to Monaco editor theme format
 * Similar to toXtermTheme but for Monaco
 */
export function toMonacoTheme(theme: Theme): MonacoTheme {
	return {
		base: theme.type === "dark" ? "vs-dark" : "vs",
		inherit: true,
		rules: createTokenRules(theme.terminal),
		colors: createEditorColors(theme),
	};
}
