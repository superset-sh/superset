import { type EditorTheme, getTerminalColors, type Theme } from "./types";
import { withAlpha } from "./utils";

/**
 * Get editor colors from a theme, falling back to a derived palette if not defined.
 */
export function getEditorTheme(theme: Theme): EditorTheme {
	const terminal = theme.terminal;
	const fallbackTerminal = getTerminalColors(theme);
	const derived: EditorTheme = {
		colors: {
			background: theme.ui.background,
			foreground: theme.ui.foreground,
			border: theme.ui.border,
			cursor: terminal?.cursor ?? theme.ui.foreground,
			gutterBackground: theme.ui.background,
			gutterForeground: theme.ui.mutedForeground,
			activeLine: withAlpha(
				theme.ui.foreground,
				theme.type === "dark" ? 0.04 : 0.06,
			),
			selection:
				terminal?.selectionBackground ??
				withAlpha(theme.ui.primary, theme.type === "dark" ? 0.28 : 0.18),
			search: theme.ui.highlightMatch,
			searchActive: theme.ui.highlightActive,
			panel: theme.ui.card,
			panelBorder: theme.ui.border,
			panelInputBackground: theme.ui.background,
			panelInputForeground: theme.ui.foreground,
			panelInputBorder: theme.ui.input,
			panelButtonBackground: theme.ui.secondary,
			panelButtonForeground: theme.ui.secondaryForeground,
			panelButtonBorder: theme.ui.border,
			diffBuffer: theme.ui.tertiary,
			diffHover: theme.ui.accent,
			diffSeparator: theme.ui.border,
			addition:
				terminal != null
					? theme.type === "dark"
						? fallbackTerminal.brightGreen
						: fallbackTerminal.green
					: theme.ui.chart2,
			deletion:
				terminal != null
					? theme.type === "dark"
						? fallbackTerminal.brightRed
						: fallbackTerminal.red
					: theme.ui.destructive,
			modified:
				terminal != null
					? theme.type === "dark"
						? fallbackTerminal.brightBlue
						: fallbackTerminal.blue
					: theme.ui.chart3,
		},
		syntax: {
			plainText: theme.ui.foreground,
			comment: terminal?.brightBlack ?? theme.ui.mutedForeground,
			keyword: terminal?.magenta ?? theme.ui.primary,
			string: terminal?.green ?? theme.ui.chart2,
			number: terminal?.yellow ?? theme.ui.chart4,
			functionCall: terminal?.blue ?? theme.ui.chart3,
			variableName: theme.ui.foreground,
			typeName: terminal?.cyan ?? theme.ui.chart3,
			className: terminal?.yellow ?? theme.ui.chart4,
			constant: terminal?.cyan ?? theme.ui.chart5,
			regexp: terminal?.red ?? theme.ui.destructive,
			tagName: terminal?.red ?? theme.ui.chart1,
			attributeName: terminal?.yellow ?? theme.ui.chart4,
			invalid: terminal?.brightRed ?? theme.ui.destructive,
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
