import { type EditorTheme, getTerminalColors, type Theme } from "./types";
import { withAlpha } from "./utils";

/**
 * Get editor colors from a theme, falling back to a derived palette if not defined.
 */
export function getEditorTheme(theme: Theme): EditorTheme {
	const terminal = getTerminalColors(theme);
	const derived: EditorTheme = {
		colors: {
			background: terminal.background,
			foreground: terminal.foreground,
			border: theme.ui.border,
			cursor: terminal.cursor,
			gutterBackground: terminal.background,
			gutterForeground: theme.ui.mutedForeground,
			activeLine: withAlpha(
				theme.ui.foreground,
				theme.type === "dark" ? 0.04 : 0.06,
			),
			selection:
				terminal.selectionBackground ??
				withAlpha(theme.ui.primary, theme.type === "dark" ? 0.28 : 0.18),
			search: theme.ui.highlightMatch,
			searchActive: theme.ui.highlightActive,
			panel: theme.ui.card,
			panelBorder: theme.ui.border,
			panelInputBackground: theme.ui.background,
			panelInputForeground: terminal.foreground,
			panelInputBorder: theme.ui.input,
			panelButtonBackground: theme.ui.secondary,
			panelButtonForeground: theme.ui.secondaryForeground,
			panelButtonBorder: theme.ui.border,
			diffBuffer: theme.ui.tertiary,
			diffHover: theme.ui.accent,
			diffSeparator: theme.ui.border,
			addition: theme.type === "dark" ? terminal.brightGreen : terminal.green,
			deletion: theme.type === "dark" ? terminal.brightRed : terminal.red,
			modified: theme.type === "dark" ? terminal.brightBlue : terminal.blue,
		},
		syntax: {
			plainText: terminal.foreground,
			comment: terminal.brightBlack,
			keyword: terminal.magenta,
			string: terminal.green,
			number: terminal.yellow,
			functionCall: terminal.blue,
			variableName: terminal.foreground,
			typeName: terminal.cyan,
			className: terminal.yellow,
			constant: terminal.cyan,
			regexp: terminal.red,
			tagName: terminal.red,
			attributeName: terminal.yellow,
			invalid: terminal.brightRed,
		},
	};

	if (!theme.editor) {
		return derived;
	}

	return {
		colors: {
			...derived.colors,
			...theme.editor.colors,
		},
		syntax: {
			...derived.syntax,
			...theme.editor.syntax,
		},
	};
}
