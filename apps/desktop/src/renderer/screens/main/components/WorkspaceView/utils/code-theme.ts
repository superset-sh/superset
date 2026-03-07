import { syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import type { DiffsThemeNames } from "@pierre/diffs/react";
import type { CSSProperties } from "react";
import {
	DEFAULT_CODE_EDITOR_FONT_FAMILY,
	DEFAULT_CODE_EDITOR_FONT_SIZE,
	MIDNIGHT_CODE_COLORS,
} from "../components/CodeEditor/constants";

interface CodeThemeFontSettings {
	fontFamily?: string;
	fontSize?: number;
}

const MIDNIGHT_DIFF_THEME = {
	light: "one-light" as DiffsThemeNames,
	dark: "one-dark-pro" as DiffsThemeNames,
};

const MIDNIGHT_DIFF_COLORS = {
	background: MIDNIGHT_CODE_COLORS.background,
	buffer: MIDNIGHT_CODE_COLORS.border,
	hover: "#2f343f",
	separator: MIDNIGHT_CODE_COLORS.border,
	lineNumber: MIDNIGHT_CODE_COLORS.muted,
	addition: MIDNIGHT_CODE_COLORS.addition,
	deletion: MIDNIGHT_CODE_COLORS.deletion,
	modified: MIDNIGHT_CODE_COLORS.modified,
	selection: MIDNIGHT_CODE_COLORS.selection,
};

export function getDiffsTheme() {
	return MIDNIGHT_DIFF_THEME;
}

export function getCodeSyntaxHighlighting(): Extension {
	return syntaxHighlighting(oneDarkHighlightStyle);
}

export function getDiffViewerStyle(
	fontSettings: CodeThemeFontSettings,
): CSSProperties {
	const fontFamily = fontSettings.fontFamily ?? DEFAULT_CODE_EDITOR_FONT_FAMILY;
	const fontSize = fontSettings.fontSize ?? DEFAULT_CODE_EDITOR_FONT_SIZE;
	const lineHeight = Math.round(fontSize * 1.5);

	return {
		"--diffs-font-family": fontFamily,
		"--diffs-font-size": `${fontSize}px`,
		"--diffs-line-height": `${lineHeight}px`,
		"--diffs-bg-buffer-override": MIDNIGHT_DIFF_COLORS.buffer,
		"--diffs-bg-hover-override": MIDNIGHT_DIFF_COLORS.hover,
		"--diffs-bg-context-override": MIDNIGHT_DIFF_COLORS.background,
		"--diffs-bg-separator-override": MIDNIGHT_DIFF_COLORS.separator,
		"--diffs-fg-number-override": MIDNIGHT_DIFF_COLORS.lineNumber,
		"--diffs-addition-color-override": MIDNIGHT_DIFF_COLORS.addition,
		"--diffs-deletion-color-override": MIDNIGHT_DIFF_COLORS.deletion,
		"--diffs-modified-color-override": MIDNIGHT_DIFF_COLORS.modified,
		"--diffs-selection-color-override": MIDNIGHT_DIFF_COLORS.selection,
		backgroundColor: MIDNIGHT_DIFF_COLORS.background,
		color: MIDNIGHT_CODE_COLORS.foreground,
	} as CSSProperties;
}
