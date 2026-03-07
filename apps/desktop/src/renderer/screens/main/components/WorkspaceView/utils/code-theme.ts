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
	light: "one-light" as DiffsThemeNames,
	dark: "one-dark-pro" as DiffsThemeNames,
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
		backgroundColor: MIDNIGHT_DIFF_COLORS.background,
		color: "#abb2bf",
	} as CSSProperties;
}
