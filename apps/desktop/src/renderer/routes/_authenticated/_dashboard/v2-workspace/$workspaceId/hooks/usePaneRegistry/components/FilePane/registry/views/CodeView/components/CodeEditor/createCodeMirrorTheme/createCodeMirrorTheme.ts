import { EditorView } from "@codemirror/view";
import { getEditorTheme, type Theme, withAlpha } from "shared/themes";
import {
	DEFAULT_CODE_EDITOR_FONT_FAMILY,
	DEFAULT_CODE_EDITOR_FONT_SIZE,
} from "../constants";

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
	const accentOverlay = withAlpha(theme.ui.accent, 0.5);
	const activeLineBackground = accentOverlay;
	const selectionBackground = accentOverlay;

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
				border: "none",
			},
			// Line numbers: more breathing room on the left edge, tighter on the
			// right since the gutter/content separator is gone.
			".cm-lineNumbers .cm-gutterElement": {
				padding: "0 2px 0 8px",
			},
			// Fold placeholder (Lucide MoreHorizontal rendered when a block is
			// collapsed). Reset button defaults, match our rounded / theme look,
			// and add a mild hover state.
			".cm-foldPlaceholder": {
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: editorTheme.colors.panel,
				border: `1px solid ${editorTheme.colors.border}`,
				color: editorTheme.colors.gutterForeground,
				borderRadius: "4px",
				margin: "0 2px",
				padding: "0 3px",
				height: `${Math.max(14, lineHeight - 4)}px`,
				cursor: "pointer",
				verticalAlign: "middle",
				transition: "background-color 120ms ease",
			},
			".cm-foldPlaceholder:hover": {
				backgroundColor: editorTheme.colors.activeLine,
			},
			".cm-foldPlaceholderIcon": {
				width: "12px",
				height: "12px",
				display: "block",
			},
			// Anchor every gutter cell to the editor's line-height so fold
			// chevrons share a row box with the digit line numbers.
			".cm-gutterElement": {
				lineHeight: `${lineHeight}px`,
			},
			// Fold chevron: render the SVG centered in its cell, transparent by
			// default, fade in when the user hovers the gutter (group-hover).
			".cm-foldGutter .cm-gutterElement": {
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: "0 2px",
			},
			".cm-foldChevron": {
				width: "12px",
				height: "12px",
				display: "block",
				opacity: 0,
				transition: "opacity 260ms ease",
			},
			".cm-gutters:hover .cm-foldChevron": {
				opacity: 1,
			},
			// Pointer cursor on foldable rows (they're the ones that render a chevron).
			".cm-foldGutter .cm-gutterElement:has(.cm-foldChevron)": {
				cursor: "pointer",
			},
			".cm-activeLine": {
				backgroundColor: activeLineBackground,
			},
			".cm-activeLineGutter": {
				backgroundColor: activeLineBackground,
			},
			// Suppress the active-line highlight while a selection is active —
			// the selectionClassTogglePlugin adds .cm-hasSelection to the editor
			// root whenever any selection range is non-empty.
			"&.cm-hasSelection .cm-activeLine": {
				backgroundColor: "transparent",
			},
			"&.cm-hasSelection .cm-activeLineGutter": {
				backgroundColor: "transparent",
			},
			// Hide CM's default per-line-width selection rectangles — our
			// contourSelectionLayer (in CodeEditor.tsx) paints per-line rects
			// snug to actual text so trailing whitespace on middle lines of a
			// multi-line selection isn't filled.
			".cm-selectionBackground": {
				display: "none",
			},
			".cm-contourSelection": {
				backgroundColor: selectionBackground,
			},
			".cm-content ::selection": {
				backgroundColor: selectionBackground,
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
