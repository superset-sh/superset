import type { MarkdownStyle } from "react-native-enriched-markdown";
import { THEME } from "@/lib/theme";

/** Dark-mode colours for the description; geometry stays the library's. */
export const DESCRIPTION_MARKDOWN_STYLE: MarkdownStyle = {
	paragraph: {
		color: THEME.dark.foreground,
		fontSize: 15,
		lineHeight: 22,
	},
	h1: { color: THEME.dark.foreground },
	h2: { color: THEME.dark.foreground },
	h3: { color: THEME.dark.foreground },
	h4: { color: THEME.dark.foreground },
	h5: { color: THEME.dark.mutedForeground },
	h6: { color: THEME.dark.mutedForeground },
	list: {
		color: THEME.dark.foreground,
		bulletColor: THEME.dark.mutedForeground,
		markerColor: THEME.dark.mutedForeground,
	},
	blockquote: {
		color: THEME.dark.mutedForeground,
		backgroundColor: THEME.dark.secondary,
		borderColor: THEME.dark.border,
	},
	code: {
		color: THEME.dark.foreground,
		backgroundColor: THEME.dark.secondary,
		borderColor: THEME.dark.border,
	},
	codeBlock: {
		color: THEME.dark.foreground,
		backgroundColor: THEME.dark.secondary,
		borderColor: THEME.dark.border,
	},
	link: { color: THEME.dark.primary },
	strong: { color: THEME.dark.foreground },
	em: { color: THEME.dark.foreground },
	strikethrough: { color: THEME.dark.mutedForeground },
	thematicBreak: { color: THEME.dark.border },
	taskList: {
		checkedColor: THEME.dark.primary,
		borderColor: THEME.dark.border,
		checkmarkColor: THEME.dark.background,
		checkedTextColor: THEME.dark.mutedForeground,
	},
	table: {
		color: THEME.dark.foreground,
		borderColor: THEME.dark.border,
		headerBackgroundColor: THEME.dark.secondary,
		headerTextColor: THEME.dark.foreground,
		rowEvenBackgroundColor: THEME.dark.background,
		rowOddBackgroundColor: THEME.dark.background,
	},
};
