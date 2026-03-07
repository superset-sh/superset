import type { Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import type { DiffsThemeNames } from "@pierre/diffs/react";
import type { CSSProperties } from "react";
import {
	DEFAULT_CODE_EDITOR_FONT_FAMILY,
	DEFAULT_CODE_EDITOR_FONT_SIZE,
} from "../components/CodeEditor/createCodeMirrorTheme";

interface CodeThemeFontSettings {
	fontFamily?: string;
	fontSize?: number;
}

const MIDNIGHT_DIFF_THEME = {
	light: "pierre-light" as DiffsThemeNames,
	dark: "pierre-dark" as DiffsThemeNames,
};

const MIDNIGHT_DIFF_COLORS = {
	background: "#000000",
	buffer: "#0a0a0a",
	hover: "#111111",
	separator: "#0a0a0a",
	lineNumber: "#636d83",
	addition: "#98c379",
	deletion: "#e06c75",
	modified: "#61afef",
	selection: "#3e4451",
	additionBackground: "#050705",
	additionNumberBackground: "#090d09",
	additionHoverBackground: "#0d120d",
	additionEmphasisBackground: "#132013",
	deletionBackground: "#070505",
	deletionNumberBackground: "#0d0909",
	deletionHoverBackground: "#120d0d",
	deletionEmphasisBackground: "#241316",
};

export function getDiffsTheme() {
	return MIDNIGHT_DIFF_THEME;
}

export function getCodeSyntaxHighlighting(): Extension {
	return oneDark;
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
		"--diffs-bg-addition-override": MIDNIGHT_DIFF_COLORS.additionBackground,
		"--diffs-bg-addition-number-override":
			MIDNIGHT_DIFF_COLORS.additionNumberBackground,
		"--diffs-bg-addition-hover-override":
			MIDNIGHT_DIFF_COLORS.additionHoverBackground,
		"--diffs-bg-addition-emphasis-override":
			MIDNIGHT_DIFF_COLORS.additionEmphasisBackground,
		"--diffs-bg-deletion-override": MIDNIGHT_DIFF_COLORS.deletionBackground,
		"--diffs-bg-deletion-number-override":
			MIDNIGHT_DIFF_COLORS.deletionNumberBackground,
		"--diffs-bg-deletion-hover-override":
			MIDNIGHT_DIFF_COLORS.deletionHoverBackground,
		"--diffs-bg-deletion-emphasis-override":
			MIDNIGHT_DIFF_COLORS.deletionEmphasisBackground,
		backgroundColor: MIDNIGHT_DIFF_COLORS.background,
		color: "#abb2bf",
	} as CSSProperties;
}
