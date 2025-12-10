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

function createTokenRules(colors: TerminalColors): editor.ITokenThemeRule[] {
	const c = tokenColor;
	return [
		{ token: "comment", foreground: c(colors.brightBlack) },
		{ token: "comment.line", foreground: c(colors.brightBlack) },
		{ token: "comment.block", foreground: c(colors.brightBlack) },

		{ token: "string", foreground: c(colors.green) },
		{ token: "string.quoted", foreground: c(colors.green) },
		{ token: "string.template", foreground: c(colors.green) },

		{ token: "keyword", foreground: c(colors.magenta) },
		{ token: "keyword.control", foreground: c(colors.magenta) },
		{ token: "keyword.operator", foreground: c(colors.red) },
		{ token: "storage", foreground: c(colors.magenta) },
		{ token: "storage.type", foreground: c(colors.cyan) },

		{ token: "number", foreground: c(colors.yellow) },
		{ token: "constant.numeric", foreground: c(colors.yellow) },
		{ token: "constant", foreground: c(colors.yellow) },
		{ token: "constant.language", foreground: c(colors.yellow) },
		{ token: "constant.character", foreground: c(colors.yellow) },

		{ token: "variable", foreground: c(colors.foreground) },
		{ token: "variable.parameter", foreground: c(colors.foreground) },
		{ token: "variable.other", foreground: c(colors.foreground) },

		{ token: "entity.name.function", foreground: c(colors.blue) },
		{ token: "support.function", foreground: c(colors.blue) },
		{ token: "meta.function-call", foreground: c(colors.blue) },

		{ token: "entity.name.type", foreground: c(colors.cyan) },
		{ token: "entity.name.class", foreground: c(colors.cyan) },
		{ token: "support.type", foreground: c(colors.cyan) },
		{ token: "support.class", foreground: c(colors.cyan) },

		{ token: "entity.name.tag", foreground: c(colors.red) },
		{ token: "tag", foreground: c(colors.red) },
		{ token: "meta.tag", foreground: c(colors.red) },

		{ token: "entity.other.attribute-name", foreground: c(colors.yellow) },
		{ token: "attribute.name", foreground: c(colors.yellow) },

		{ token: "keyword.operator", foreground: c(colors.red) },
		{ token: "punctuation", foreground: c(colors.foreground) },

		{ token: "type", foreground: c(colors.cyan) },
		{ token: "type.identifier", foreground: c(colors.cyan) },
		{ token: "identifier", foreground: c(colors.foreground) },
		{ token: "delimiter", foreground: c(colors.foreground) },

		{ token: "string.key.json", foreground: c(colors.red) },
		{ token: "string.value.json", foreground: c(colors.green) },

		{ token: "regexp", foreground: c(colors.cyan) },

		{ token: "markup.heading", foreground: c(colors.red), fontStyle: "bold" },
		{ token: "markup.bold", foreground: c(colors.yellow), fontStyle: "bold" },
		{
			token: "markup.italic",
			foreground: c(colors.magenta),
			fontStyle: "italic",
		},
		{ token: "markup.inline.raw", foreground: c(colors.green) },
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
	return {
		base: theme.type === "dark" ? "vs-dark" : "vs",
		inherit: true,
		rules: createTokenRules(theme.terminal),
		colors: createEditorColors(theme),
	};
}
