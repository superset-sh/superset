import { EditorView } from "@codemirror/view";
import { getTerminalColors, type Theme } from "shared/themes";

interface CodeEditorFontSettings {
	fontFamily?: string;
	fontSize?: number;
}

export const DEFAULT_CODE_EDITOR_FONT_FAMILY =
	"ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace";
export const DEFAULT_CODE_EDITOR_FONT_SIZE = 13;

export function createCodeMirrorTheme(
	theme: Theme | null,
	fontSettings: CodeEditorFontSettings,
	fillHeight: boolean,
) {
	const ui = theme?.ui;
	const terminal = theme ? getTerminalColors(theme) : null;
	const fontSize = fontSettings.fontSize ?? DEFAULT_CODE_EDITOR_FONT_SIZE;
	const lineHeight = Math.round(fontSize * 1.5);

	return EditorView.theme(
		{
			"&": {
				height: fillHeight ? "100%" : "auto",
				backgroundColor: ui?.background ?? "#0d0d0d",
				color: ui?.foreground ?? "#f5f5f5",
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
				caretColor: ui?.foreground ?? "#f5f5f5",
			},
			".cm-line": {
				padding: "0 12px",
			},
			".cm-gutters": {
				backgroundColor: ui?.background ?? "#0d0d0d",
				color: ui?.mutedForeground ?? "#8a8a8a",
				borderRight: `1px solid ${ui?.border ?? "#2a2a2a"}`,
			},
			".cm-activeLine": {
				backgroundColor: ui?.muted ?? "rgba(255, 255, 255, 0.04)",
			},
			".cm-activeLineGutter": {
				backgroundColor: ui?.muted ?? "rgba(255, 255, 255, 0.04)",
			},
			".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
				{
					backgroundColor:
						terminal?.selectionBackground ??
						ui?.accent ??
						"rgba(59, 130, 246, 0.28)",
				},
			".cm-selectionMatch": {
				backgroundColor: ui?.highlightMatch ?? "rgba(250, 204, 21, 0.16)",
			},
			".cm-cursor, .cm-dropCursor": {
				borderLeftColor: ui?.foreground ?? "#f5f5f5",
			},
			".cm-searchMatch": {
				backgroundColor: ui?.highlightMatch ?? "rgba(250, 204, 21, 0.2)",
				outline: "none",
			},
			".cm-searchMatch.cm-searchMatch-selected": {
				backgroundColor: ui?.highlightActive ?? "rgba(245, 158, 11, 0.35)",
			},
			".cm-panels": {
				backgroundColor: ui?.card ?? ui?.background ?? "#0d0d0d",
				color: ui?.cardForeground ?? ui?.foreground ?? "#f5f5f5",
				borderBottom: `1px solid ${ui?.border ?? "#2a2a2a"}`,
			},
			".cm-panels .cm-textfield": {
				backgroundColor: ui?.input ?? ui?.card ?? "#171717",
				color: ui?.foreground ?? "#f5f5f5",
				border: `1px solid ${ui?.border ?? "#2a2a2a"}`,
			},
			".cm-button": {
				backgroundImage: "none",
				backgroundColor: ui?.secondary ?? "#262626",
				color: ui?.secondaryForeground ?? ui?.foreground ?? "#f5f5f5",
				border: `1px solid ${ui?.border ?? "#2a2a2a"}`,
			},
		},
		{
			dark: theme?.type !== "light",
		},
	);
}
