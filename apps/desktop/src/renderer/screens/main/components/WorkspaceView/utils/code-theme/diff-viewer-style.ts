import type { CSSProperties } from "react";
import { getEditorTheme, type Theme } from "shared/themes";
import {
	DEFAULT_CODE_EDITOR_FONT_FAMILY,
	DEFAULT_CODE_EDITOR_FONT_SIZE,
} from "../../components/CodeEditor/constants";

interface CodeThemeFontSettings {
	fontFamily?: string;
	fontSize?: number;
}

export function getDiffViewerStyle(
	theme: Theme,
	fontSettings: CodeThemeFontSettings,
): CSSProperties {
	const fontFamily = fontSettings.fontFamily ?? DEFAULT_CODE_EDITOR_FONT_FAMILY;
	const fontSize = fontSettings.fontSize ?? DEFAULT_CODE_EDITOR_FONT_SIZE;
	const lineHeight = Math.round(fontSize * 1.5);
	const editorTheme = getEditorTheme(theme);

	return {
		"--diffs-font-family": fontFamily,
		"--diffs-font-size": `${fontSize}px`,
		"--diffs-line-height": `${lineHeight}px`,
		"--diffs-bg-buffer-override": editorTheme.colors.diffBuffer,
		"--diffs-bg-hover-override": editorTheme.colors.diffHover,
		"--diffs-bg-context-override": editorTheme.colors.background,
		"--diffs-bg-separator-override": editorTheme.colors.diffSeparator,
		"--diffs-fg-number-override": editorTheme.colors.gutterForeground,
		"--diffs-addition-color-override": editorTheme.colors.addition,
		"--diffs-deletion-color-override": editorTheme.colors.deletion,
		"--diffs-modified-color-override": editorTheme.colors.modified,
		"--diffs-selection-color-override": editorTheme.colors.selection,
		backgroundColor: editorTheme.colors.background,
		color: editorTheme.colors.foreground,
	} as CSSProperties;
}
