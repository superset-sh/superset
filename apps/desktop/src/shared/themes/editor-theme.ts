import { type EditorTheme, getTerminalColors, type Theme } from "./types";
import { contrastRatio, withAlpha } from "./utils";

/**
 * Minimum contrast a comment color must clear against the editor background to
 * be used as-is. ANSI brightBlack is dim by design and in most dark themes sits
 * well below this, so it's rejected in favor of the theme's designed-to-be-read
 * secondary text color. See #5662.
 */
const MIN_COMMENT_CONTRAST = 4.5;

/**
 * Pick the comment token color. brightBlack is a good comment color when it's
 * legible, but in imported dark themes it's often the dim ANSI slot (e.g. Tokyo
 * Night's #414868 at ~1.9:1) — unreadable once the diff view composites line
 * tints on top. Fall back to mutedForeground, which themes design to be read.
 */
function deriveComment(theme: Theme): string {
	const brightBlack = theme.terminal?.brightBlack;
	if (
		brightBlack &&
		contrastRatio(brightBlack, theme.ui.background) >= MIN_COMMENT_CONTRAST
	) {
		return brightBlack;
	}
	return theme.ui.mutedForeground;
}

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
			activeLine: withAlpha(theme.ui.accent, 0.5),
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
			comment: deriveComment(theme),
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
