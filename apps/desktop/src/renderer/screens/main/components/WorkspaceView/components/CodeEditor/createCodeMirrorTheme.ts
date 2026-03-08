import { EditorView } from "@codemirror/view";
import {
	DEFAULT_CODE_EDITOR_FONT_FAMILY,
	DEFAULT_CODE_EDITOR_FONT_SIZE,
	MIDNIGHT_CODE_COLORS,
} from "./constants";

interface CodeEditorFontSettings {
	fontFamily?: string;
	fontSize?: number;
}

export function createCodeMirrorTheme(
	fontSettings: CodeEditorFontSettings,
	fillHeight: boolean,
) {
	const fontSize = fontSettings.fontSize ?? DEFAULT_CODE_EDITOR_FONT_SIZE;
	const lineHeight = Math.round(fontSize * 1.5);

	return EditorView.theme(
		{
			"&": {
				height: fillHeight ? "100%" : "auto",
				backgroundColor: MIDNIGHT_CODE_COLORS.background,
				color: MIDNIGHT_CODE_COLORS.foreground,
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
				caretColor: MIDNIGHT_CODE_COLORS.foreground,
			},
			".cm-line": {
				padding: "0 12px",
			},
			".cm-gutters": {
				backgroundColor: MIDNIGHT_CODE_COLORS.background,
				color: MIDNIGHT_CODE_COLORS.muted,
				borderRight: `1px solid ${MIDNIGHT_CODE_COLORS.border}`,
			},
			".cm-activeLine": {
				backgroundColor: MIDNIGHT_CODE_COLORS.activeLine,
			},
			".cm-activeLineGutter": {
				backgroundColor: MIDNIGHT_CODE_COLORS.activeLine,
			},
			"&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
				{
					backgroundColor: MIDNIGHT_CODE_COLORS.selection,
				},
			".cm-selectionMatch": {
				backgroundColor: MIDNIGHT_CODE_COLORS.search,
			},
			".cm-cursor, .cm-dropCursor": {
				borderLeftColor: MIDNIGHT_CODE_COLORS.foreground,
			},
			".cm-searchMatch": {
				backgroundColor: MIDNIGHT_CODE_COLORS.search,
				outline: "none",
			},
			".cm-searchMatch.cm-searchMatch-selected": {
				backgroundColor: MIDNIGHT_CODE_COLORS.searchActive,
			},
			".cm-panels": {
				backgroundColor: MIDNIGHT_CODE_COLORS.panel,
				color: MIDNIGHT_CODE_COLORS.foreground,
				borderBottom: `1px solid ${MIDNIGHT_CODE_COLORS.border}`,
			},
			".cm-panels .cm-textfield": {
				backgroundColor: MIDNIGHT_CODE_COLORS.background,
				color: MIDNIGHT_CODE_COLORS.foreground,
				border: `1px solid ${MIDNIGHT_CODE_COLORS.border}`,
			},
			".cm-button": {
				backgroundImage: "none",
				backgroundColor: MIDNIGHT_CODE_COLORS.surface,
				color: MIDNIGHT_CODE_COLORS.foreground,
				border: `1px solid ${MIDNIGHT_CODE_COLORS.border}`,
			},
		},
		{
			dark: true,
		},
	);
}
