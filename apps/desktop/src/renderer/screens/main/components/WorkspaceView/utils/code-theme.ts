import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import { registerCustomTheme } from "@pierre/diffs";
import type { DiffsThemeNames } from "@pierre/diffs/react";
import type { CSSProperties } from "react";
import { getEditorTheme, type Theme } from "shared/themes";
import { toHex, toHexAuto } from "shared/themes/utils";
import {
	DEFAULT_CODE_EDITOR_FONT_FAMILY,
	DEFAULT_CODE_EDITOR_FONT_SIZE,
} from "../components/CodeEditor/constants";

interface CodeThemeFontSettings {
	fontFamily?: string;
	fontSize?: number;
}

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

export function getCodeSyntaxHighlighting(theme: Theme): Extension {
	const editorTheme = getEditorTheme(theme);

	return syntaxHighlighting(
		HighlightStyle.define([
			{
				tag: [tags.keyword, tags.operatorKeyword, tags.modifier],
				color: editorTheme.syntax.keyword,
			},
			{
				tag: [tags.comment, tags.lineComment, tags.blockComment],
				color: editorTheme.syntax.comment,
				fontStyle: "italic",
			},
			{
				tag: [tags.string, tags.special(tags.string)],
				color: editorTheme.syntax.string,
			},
			{
				tag: [tags.number, tags.integer, tags.float, tags.bool, tags.null],
				color: editorTheme.syntax.number,
			},
			{
				tag: [
					tags.function(tags.variableName),
					tags.function(tags.propertyName),
					tags.labelName,
				],
				color: editorTheme.syntax.functionCall,
			},
			{
				tag: [tags.variableName, tags.name, tags.propertyName],
				color: editorTheme.syntax.variableName,
			},
			{
				tag: [tags.typeName, tags.definition(tags.typeName)],
				color: editorTheme.syntax.typeName,
			},
			{
				tag: [tags.className],
				color: editorTheme.syntax.className,
			},
			{
				tag: [tags.constant(tags.name), tags.standard(tags.name)],
				color: editorTheme.syntax.constant,
			},
			{
				tag: [tags.regexp, tags.escape, tags.special(tags.regexp)],
				color: editorTheme.syntax.regexp,
			},
			{
				tag: [tags.tagName, tags.angleBracket],
				color: editorTheme.syntax.tagName,
			},
			{
				tag: [tags.attributeName],
				color: editorTheme.syntax.attributeName,
			},
			{
				tag: [tags.invalid],
				color: editorTheme.syntax.invalid,
			},
		]),
	);
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
