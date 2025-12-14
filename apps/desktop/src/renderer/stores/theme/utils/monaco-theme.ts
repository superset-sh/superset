import type { editor } from "monaco-editor";
import type { TerminalColors, Theme } from "shared/themes/types";
import { stripHash, toHexAuto, withAlpha } from "shared/themes/utils";

export interface MonacoTheme {
	base: "vs" | "vs-dark" | "hc-black";
	inherit: boolean;
	rules: editor.ITokenThemeRule[];
	colors: editor.IColors;
}

function tokenColor(color: string): string {
	return stripHash(toHexAuto(color));
}

function createTokenRules(
	colors: TerminalColors,
	isDark: boolean,
): editor.ITokenThemeRule[] {
	const c = tokenColor;
	// Note: Avoid pure red/green to prevent confusion with diff view highlighting
	// Use brighter variants in dark mode, darker variants in light mode for contrast

	// Select colors based on theme type for optimal contrast
	const string = isDark ? colors.brightYellow : colors.blue;
	const keyword = isDark ? colors.brightMagenta : colors.magenta;
	const number = isDark ? colors.yellow : colors.magenta;
	const func = isDark ? colors.brightBlue : colors.blue;
	const type = isDark ? colors.brightCyan : colors.cyan;
	const tag = isDark ? colors.brightMagenta : colors.magenta;
	const attribute = isDark ? colors.brightCyan : colors.cyan;
	const comment = colors.brightBlack;

	return [
		{ token: "comment", foreground: c(comment) },
		{ token: "comment.line", foreground: c(comment) },
		{ token: "comment.block", foreground: c(comment) },

		{ token: "string", foreground: c(string) },
		{ token: "string.quoted", foreground: c(string) },
		{ token: "string.template", foreground: c(string) },

		{ token: "keyword", foreground: c(keyword) },
		{ token: "keyword.control", foreground: c(keyword) },
		{ token: "keyword.operator", foreground: c(keyword) },
		{ token: "storage", foreground: c(keyword) },
		{ token: "storage.type", foreground: c(type) },

		{ token: "number", foreground: c(number) },
		{ token: "constant.numeric", foreground: c(number) },
		{ token: "constant", foreground: c(number) },
		{ token: "constant.language", foreground: c(number) },
		{ token: "constant.character", foreground: c(number) },

		{ token: "variable", foreground: c(colors.foreground) },
		{ token: "variable.parameter", foreground: c(colors.foreground) },
		{ token: "variable.other", foreground: c(colors.foreground) },

		{ token: "entity.name.function", foreground: c(func) },
		{ token: "support.function", foreground: c(func) },
		{ token: "meta.function-call", foreground: c(func) },

		{ token: "entity.name.type", foreground: c(type) },
		{ token: "entity.name.class", foreground: c(type) },
		{ token: "support.type", foreground: c(type) },
		{ token: "support.class", foreground: c(type) },

		{ token: "entity.name.tag", foreground: c(tag) },
		{ token: "tag", foreground: c(tag) },
		{ token: "meta.tag", foreground: c(tag) },

		{ token: "entity.other.attribute-name", foreground: c(attribute) },
		{ token: "attribute.name", foreground: c(attribute) },

		{ token: "keyword.operator", foreground: c(keyword) },
		{ token: "punctuation", foreground: c(colors.foreground) },

		{ token: "type", foreground: c(type) },
		{ token: "type.identifier", foreground: c(type) },
		{ token: "identifier", foreground: c(colors.foreground) },
		{ token: "delimiter", foreground: c(colors.foreground) },

		{ token: "string.key.json", foreground: c(func) },
		{ token: "string.value.json", foreground: c(string) },

		{ token: "regexp", foreground: c(type) },

		{ token: "markup.heading", foreground: c(func), fontStyle: "bold" },
		{ token: "markup.bold", foreground: c(number), fontStyle: "bold" },
		{
			token: "markup.italic",
			foreground: c(keyword),
			fontStyle: "italic",
		},
		{ token: "markup.inline.raw", foreground: c(type) },
	];
}

function createEditorColors(theme: Theme): editor.IColors {
	const { terminal, ui } = theme;
	const hex = toHexAuto;
	const alpha = withAlpha;

	const selectionBg = terminal.selectionBackground
		? hex(terminal.selectionBackground)
		: alpha(terminal.foreground, 0.2);

	return {
		"editor.background": hex(terminal.background),
		"editor.foreground": hex(terminal.foreground),
		"editor.lineHighlightBackground": hex(ui.accent),
		"editor.lineHighlightBorder": "#00000000",
		"editor.selectionBackground": selectionBg,
		"editor.selectionHighlightBackground": alpha(terminal.blue, 0.2),
		"editor.inactiveSelectionBackground": alpha(terminal.foreground, 0.1),
		"editor.findMatchBackground": alpha(terminal.yellow, 0.27),
		"editor.findMatchHighlightBackground": alpha(terminal.yellow, 0.13),

		"editorLineNumber.foreground": hex(terminal.brightBlack),
		"editorLineNumber.activeForeground": hex(terminal.foreground),
		"editorGutter.background": hex(terminal.background),
		"editorCursor.foreground": hex(terminal.cursor),

		"diffEditor.insertedTextBackground": alpha(terminal.green, 0.13),
		"diffEditor.removedTextBackground": alpha(terminal.red, 0.13),
		"diffEditor.insertedLineBackground": alpha(terminal.green, 0.08),
		"diffEditor.removedLineBackground": alpha(terminal.red, 0.08),
		"diffEditorGutter.insertedLineBackground": alpha(terminal.green, 0.2),
		"diffEditorGutter.removedLineBackground": alpha(terminal.red, 0.2),
		"diffEditor.diagonalFill": hex(ui.border),

		"scrollbar.shadow": "#00000000",
		"scrollbarSlider.background": alpha(terminal.foreground, 0.13),
		"scrollbarSlider.hoverBackground": alpha(terminal.foreground, 0.2),
		"scrollbarSlider.activeBackground": alpha(terminal.foreground, 0.27),

		"editorWidget.background": hex(ui.popover),
		"editorWidget.foreground": hex(ui.popoverForeground),
		"editorWidget.border": hex(ui.border),

		"editorBracketMatch.background": alpha(terminal.cyan, 0.2),
		"editorBracketMatch.border": hex(terminal.cyan),

		"editorIndentGuide.background": alpha(terminal.foreground, 0.08),
		"editorIndentGuide.activeBackground": alpha(terminal.foreground, 0.2),
		"editorWhitespace.foreground": alpha(terminal.foreground, 0.13),
		"editorOverviewRuler.border": "#00000000",
	};
}

export function toMonacoTheme(theme: Theme): MonacoTheme {
	const isDark = theme.type === "dark";
	return {
		base: isDark ? "vs-dark" : "vs",
		inherit: true,
		rules: createTokenRules(theme.terminal, isDark),
		colors: createEditorColors(theme),
	};
}
