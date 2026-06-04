import { EditorView } from "@codemirror/view";
import { getEditorTheme, type Theme } from "shared/themes";
import {
	DEFAULT_CODE_EDITOR_FONT_FAMILY,
	DEFAULT_CODE_EDITOR_FONT_SIZE,
} from "./constants";

interface CodeEditorFontSettings {
	fontFamily?: string;
	fontSize?: number;
}

export function createCodeMirrorTheme(
	theme: Theme,
	fontSettings: CodeEditorFontSettings,
	fillHeight: boolean,
) {
	const fontSize = fontSettings.fontSize ?? DEFAULT_CODE_EDITOR_FONT_SIZE;
	const lineHeight = Math.round(fontSize * 1.5);
	const editorTheme = getEditorTheme(theme);

	return EditorView.theme(
		{
			"&": {
				height: fillHeight ? "100%" : "auto",
				backgroundColor: editorTheme.colors.background,
				color: editorTheme.colors.foreground,
				fontFamily: fontSettings.fontFamily ?? DEFAULT_CODE_EDITOR_FONT_FAMILY,
				fontSize: `${fontSize}px`,
			},
			".cm-scroller": {
				fontFamily: "inherit",
				lineHeight: `${lineHeight}px`,
				overflow: fillHeight ? "auto" : "visible",
			},
			".cm-content": {
				padding: "8px 0",
				caretColor: editorTheme.colors.cursor,
			},
			".cm-line": {
				padding: "0 12px",
			},
			".cm-gutters": {
				backgroundColor: editorTheme.colors.gutterBackground,
				color: editorTheme.colors.gutterForeground,
				borderRight: `1px solid ${editorTheme.colors.border}`,
			},
			".cm-activeLine": {
				backgroundColor: editorTheme.colors.activeLine,
			},
			".cm-activeLineGutter": {
				backgroundColor: editorTheme.colors.activeLine,
			},
			"&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
				{
					backgroundColor: editorTheme.colors.selection,
				},
			".cm-selectionMatch": {
				backgroundColor: editorTheme.colors.search,
			},
			".cm-cursor, .cm-dropCursor": {
				borderLeftColor: editorTheme.colors.cursor,
			},
			".cm-searchMatch": {
				backgroundColor: editorTheme.colors.search,
				outline: "none",
			},
			".cm-searchMatch.cm-searchMatch-selected": {
				backgroundColor: editorTheme.colors.searchActive,
			},
			".cm-panels": {
				backgroundColor: editorTheme.colors.panel,
				color: editorTheme.colors.foreground,
				borderBottom: `1px solid ${editorTheme.colors.panelBorder}`,
			},
			".cm-panels .cm-textfield": {
				backgroundColor: editorTheme.colors.panelInputBackground,
				color: editorTheme.colors.panelInputForeground,
				border: `1px solid ${editorTheme.colors.panelInputBorder}`,
			},
			".cm-button": {
				backgroundImage: "none",
				backgroundColor: editorTheme.colors.panelButtonBackground,
				color: editorTheme.colors.panelButtonForeground,
				border: `1px solid ${editorTheme.colors.panelButtonBorder}`,
			},
		},
		{
			dark: theme.type === "dark",
		},
	);
}
