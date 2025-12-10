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

	// Get selection background, handling rgba format
	const selectionBg =
		terminal.selectionBackground || `${terminal.foreground}33`;

	return {
		// Editor background matches terminal
		"editor.background": terminal.background,
		"editor.foreground": terminal.foreground,

		// Line highlights
		"editor.lineHighlightBackground": ui.accent,
		"editor.lineHighlightBorder": "#00000000",

		// Selection
		"editor.selectionBackground": selectionBg,
		"editor.selectionHighlightBackground": `${terminal.blue}33`,
		"editor.inactiveSelectionBackground": `${selectionBg}88`,

		// Find matches
		"editor.findMatchBackground": `${terminal.yellow}44`,
		"editor.findMatchHighlightBackground": `${terminal.yellow}22`,

		// Gutter (line numbers)
		"editorLineNumber.foreground": terminal.brightBlack,
		"editorLineNumber.activeForeground": terminal.foreground,
		"editorGutter.background": terminal.background,

		// Cursor
		"editorCursor.foreground": terminal.cursor,

		// Diff colors - use semantic colors
		"diffEditor.insertedTextBackground": `${terminal.green}22`,
		"diffEditor.removedTextBackground": `${terminal.red}22`,
		"diffEditor.insertedLineBackground": `${terminal.green}15`,
		"diffEditor.removedLineBackground": `${terminal.red}15`,
		"diffEditorGutter.insertedLineBackground": `${terminal.green}33`,
		"diffEditorGutter.removedLineBackground": `${terminal.red}33`,
		"diffEditor.diagonalFill": ui.border,

		// Scrollbar
		"scrollbar.shadow": "#00000000",
		"scrollbarSlider.background": `${terminal.foreground}22`,
		"scrollbarSlider.hoverBackground": `${terminal.foreground}33`,
		"scrollbarSlider.activeBackground": `${terminal.foreground}44`,

		// Widget (autocomplete, etc.)
		"editorWidget.background": ui.popover,
		"editorWidget.foreground": ui.popoverForeground,
		"editorWidget.border": ui.border,

		// Bracket matching
		"editorBracketMatch.background": `${terminal.cyan}33`,
		"editorBracketMatch.border": terminal.cyan,

		// Indent guides
		"editorIndentGuide.background": `${terminal.foreground}15`,
		"editorIndentGuide.activeBackground": `${terminal.foreground}33`,

		// Whitespace
		"editorWhitespace.foreground": `${terminal.foreground}22`,

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
