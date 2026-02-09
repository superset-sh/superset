import type { editor } from "monaco-editor";
import { getTerminalColors, type Theme } from "shared/themes";
import { toHexAuto, withAlpha } from "shared/themes/utils";

export interface MonacoTheme {
	base: "vs" | "vs-dark" | "hc-black";
	inherit: boolean;
	rules: editor.ITokenThemeRule[];
	colors: editor.IColors;
}

function createEditorColors(theme: Theme): editor.IColors {
	const terminal = getTerminalColors(theme);
	const { ui } = theme;
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

		"diffEditor.insertedTextBackground": alpha(terminal.green, 0.2),
		"diffEditor.removedTextBackground": alpha(terminal.red, 0.2),
		"diffEditor.insertedLineBackground": alpha(terminal.green, 0.2),
		"diffEditor.removedLineBackground": alpha(terminal.red, 0.2),
		"diffEditorGutter.insertedLineBackground": alpha(terminal.green, 0.15),
		"diffEditorGutter.removedLineBackground": alpha(terminal.red, 0.15),
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

function createTokenRules(theme: Theme): editor.ITokenThemeRule[] {
	const terminal = getTerminalColors(theme);
	const hex = (color: string) => toHexAuto(color).slice(1);

	return [
		// Markdown
		{ token: "keyword.md", foreground: hex(terminal.blue) },
		{ token: "string.link.md", foreground: hex(terminal.cyan) },
		{ token: "variable.md", foreground: hex(terminal.blue) },
		{ token: "string.md", foreground: hex(terminal.green) },
		{ token: "variable.source.md", foreground: hex(terminal.foreground) },
		{ token: "markup.bold.md", fontStyle: "bold" },
		{ token: "markup.italic.md", fontStyle: "italic" },
		{ token: "markup.strikethrough.md", fontStyle: "strikethrough" },
	];
}

export function toMonacoTheme(theme: Theme): MonacoTheme {
	const isDark = theme.type === "dark";
	return {
		base: isDark ? "vs-dark" : "vs",
		inherit: true,
		rules: createTokenRules(theme),
		colors: createEditorColors(theme),
	};
}
