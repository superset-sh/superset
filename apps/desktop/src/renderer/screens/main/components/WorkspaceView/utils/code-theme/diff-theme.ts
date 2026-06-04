import { registerCustomTheme } from "@pierre/diffs";
import type { DiffsThemeNames } from "@pierre/diffs/react";
import { getEditorTheme, type Theme } from "shared/themes";
import { toHex, toHexAuto } from "shared/themes/utils";

const REGISTERED_DIFF_THEMES = new Set<string>();

function hashString(value: string): string {
	let hash = 0;

	for (let index = 0; index < value.length; index += 1) {
		hash = (hash << 5) - hash + value.charCodeAt(index);
		hash |= 0;
	}

	return Math.abs(hash).toString(36);
}

function createDiffThemeName(theme: Theme): DiffsThemeNames {
	const signature = hashString(JSON.stringify(getEditorTheme(theme)));
	return `superset-diff-${theme.id}-${signature}` as DiffsThemeNames;
}

function createShikiTheme(theme: Theme) {
	const editorTheme = getEditorTheme(theme);

	return {
		name: createDiffThemeName(theme),
		type: theme.type,
		colors: {
			"editor.background": toHex(editorTheme.colors.background),
			"editor.foreground": toHex(editorTheme.colors.foreground),
			"editorLineNumber.foreground": toHex(editorTheme.colors.gutterForeground),
			"editorLineNumber.activeForeground": toHex(editorTheme.colors.foreground),
			"editor.selectionBackground": toHexAuto(editorTheme.colors.selection),
			"editor.lineHighlightBackground": toHexAuto(
				editorTheme.colors.activeLine,
			),
		},
		tokenColors: [
			{
				settings: {
					foreground: toHex(editorTheme.syntax.plainText),
					background: toHex(editorTheme.colors.background),
				},
			},
			{
				scope: ["comment", "punctuation.definition.comment"],
				settings: {
					foreground: toHex(editorTheme.syntax.comment),
					fontStyle: "italic",
				},
			},
			{
				scope: ["keyword", "storage", "storage.type"],
				settings: {
					foreground: toHex(editorTheme.syntax.keyword),
				},
			},
			{
				scope: ["string", "string.template", "string.regexp"],
				settings: {
					foreground: toHex(editorTheme.syntax.string),
				},
			},
			{
				scope: ["constant.numeric", "number", "constant.language"],
				settings: {
					foreground: toHex(editorTheme.syntax.number),
				},
			},
			{
				scope: [
					"entity.name.function",
					"support.function",
					"meta.function-call",
				],
				settings: {
					foreground: toHex(editorTheme.syntax.functionCall),
				},
			},
			{
				scope: ["variable", "meta.definition.variable", "identifier"],
				settings: {
					foreground: toHex(editorTheme.syntax.variableName),
				},
			},
			{
				scope: ["entity.name.type", "support.type", "storage.type"],
				settings: {
					foreground: toHex(editorTheme.syntax.typeName),
				},
			},
			{
				scope: ["entity.name.class", "entity.other.inherited-class"],
				settings: {
					foreground: toHex(editorTheme.syntax.className),
				},
			},
			{
				scope: ["constant", "support.constant"],
				settings: {
					foreground: toHex(editorTheme.syntax.constant),
				},
			},
			{
				scope: ["string.regexp", "constant.other.character-class.regexp"],
				settings: {
					foreground: toHex(editorTheme.syntax.regexp),
				},
			},
			{
				scope: [
					"entity.name.tag",
					"punctuation.definition.tag",
					"support.class.component",
				],
				settings: {
					foreground: toHex(editorTheme.syntax.tagName),
				},
			},
			{
				scope: ["entity.other.attribute-name"],
				settings: {
					foreground: toHex(editorTheme.syntax.attributeName),
				},
			},
			{
				scope: ["invalid", "invalid.illegal"],
				settings: {
					foreground: toHex(editorTheme.syntax.invalid),
				},
			},
		],
	};
}

export function getDiffsTheme(theme: Theme): DiffsThemeNames {
	const themeName = createDiffThemeName(theme);

	if (!REGISTERED_DIFF_THEMES.has(themeName)) {
		registerCustomTheme(themeName, async () => createShikiTheme(theme));
		REGISTERED_DIFF_THEMES.add(themeName);
	}

	return themeName;
}
