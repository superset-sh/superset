import { EditorView } from "@codemirror/view";

interface CodeEditorFontSettings {
	fontFamily?: string;
	fontSize?: number;
}

export const DEFAULT_CODE_EDITOR_FONT_FAMILY =
	"ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace";
export const DEFAULT_CODE_EDITOR_FONT_SIZE = 13;

const MIDNIGHT_EDITOR_BACKGROUND = "#282c34";
const MIDNIGHT_EDITOR_BORDER = "#21252b";
const MIDNIGHT_EDITOR_MUTED = "#636d83";
const MIDNIGHT_EDITOR_SELECTION = "#3e4451";
const MIDNIGHT_EDITOR_SEARCH = "#e5c07b33";
const MIDNIGHT_EDITOR_SEARCH_ACTIVE = "#e5c07b55";
const MIDNIGHT_EDITOR_PANEL = "#21252b";
const MIDNIGHT_EDITOR_SURFACE = "#2c313c";
const MIDNIGHT_EDITOR_FOREGROUND = "#abb2bf";

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
				backgroundColor: MIDNIGHT_EDITOR_BACKGROUND,
				color: MIDNIGHT_EDITOR_FOREGROUND,
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
				caretColor: MIDNIGHT_EDITOR_FOREGROUND,
			},
			".cm-line": {
				padding: "0 12px",
			},
			".cm-gutters": {
				backgroundColor: MIDNIGHT_EDITOR_BACKGROUND,
				color: MIDNIGHT_EDITOR_MUTED,
				borderRight: `1px solid ${MIDNIGHT_EDITOR_BORDER}`,
			},
			".cm-activeLine": {
				backgroundColor: MIDNIGHT_EDITOR_SURFACE,
			},
			".cm-activeLineGutter": {
				backgroundColor: MIDNIGHT_EDITOR_SURFACE,
			},
			".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
				{
					backgroundColor: MIDNIGHT_EDITOR_SELECTION,
				},
			".cm-selectionMatch": {
				backgroundColor: MIDNIGHT_EDITOR_SEARCH,
			},
			".cm-cursor, .cm-dropCursor": {
				borderLeftColor: MIDNIGHT_EDITOR_FOREGROUND,
			},
			".cm-searchMatch": {
				backgroundColor: MIDNIGHT_EDITOR_SEARCH,
				outline: "none",
			},
			".cm-searchMatch.cm-searchMatch-selected": {
				backgroundColor: MIDNIGHT_EDITOR_SEARCH_ACTIVE,
			},
			".cm-panels": {
				backgroundColor: MIDNIGHT_EDITOR_PANEL,
				color: MIDNIGHT_EDITOR_FOREGROUND,
				borderBottom: `1px solid ${MIDNIGHT_EDITOR_BORDER}`,
			},
			".cm-panels .cm-textfield": {
				backgroundColor: MIDNIGHT_EDITOR_BACKGROUND,
				color: MIDNIGHT_EDITOR_FOREGROUND,
				border: `1px solid ${MIDNIGHT_EDITOR_BORDER}`,
			},
			".cm-button": {
				backgroundImage: "none",
				backgroundColor: MIDNIGHT_EDITOR_SURFACE,
				color: MIDNIGHT_EDITOR_FOREGROUND,
				border: `1px solid ${MIDNIGHT_EDITOR_BORDER}`,
			},
		},
		{
			dark: true,
		},
	);
}
