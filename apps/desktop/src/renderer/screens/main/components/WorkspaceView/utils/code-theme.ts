import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import type { DiffsThemeNames } from "@pierre/diffs/react";
import type { CSSProperties } from "react";
import type { Theme } from "shared/themes";
import {
	DEFAULT_CODE_EDITOR_FONT_FAMILY,
	DEFAULT_CODE_EDITOR_FONT_SIZE,
} from "../components/CodeEditor/createCodeMirrorTheme";

interface CodeThemeFontSettings {
	fontFamily?: string;
	fontSize?: number;
}

const SHIKI_THEME_MAP: Record<
	string,
	{ light: DiffsThemeNames; dark: DiffsThemeNames }
> = {
	dark: { light: "github-light-default", dark: "github-dark-default" },
	light: { light: "github-light-default", dark: "github-dark-default" },
	"one-dark": { light: "one-light", dark: "one-dark-pro" },
	monokai: { light: "one-light", dark: "monokai" },
	ember: { light: "one-light", dark: "vitesse-dark" },
};

const DEFAULT_SHIKI_THEME = {
	light: "github-light-default" as DiffsThemeNames,
	dark: "github-dark-default" as DiffsThemeNames,
};

export function getDiffsTheme(theme: Theme | null) {
	const themeId = theme?.id ?? "dark";
	return SHIKI_THEME_MAP[themeId] ?? DEFAULT_SHIKI_THEME;
}

export function getCodeSyntaxHighlighting(theme: Theme | null): Extension {
	const ui = theme?.ui;
	const styles = HighlightStyle.define([
		{
			tag: [t.keyword, t.modifier, t.controlKeyword],
			color: ui?.chart4 ?? ui?.primary ?? ui?.foreground,
		},
		{
			tag: [t.operatorKeyword, t.operator],
			color: ui?.mutedForeground ?? ui?.foreground,
		},
		{
			tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
			color: ui?.mutedForeground ?? "#6b7280",
			fontStyle: "italic",
		},
		{
			tag: [t.string, t.special(t.string), t.regexp],
			color: ui?.chart2 ?? ui?.primary ?? ui?.foreground,
		},
		{
			tag: [t.number, t.bool, t.null, t.atom],
			color: ui?.chart3 ?? ui?.primary ?? ui?.foreground,
		},
		{
			tag: [t.className, t.typeName, t.namespace, t.definition(t.typeName)],
			color: ui?.chart1 ?? ui?.primary ?? ui?.foreground,
		},
		{
			tag: [
				t.function(t.variableName),
				t.function(t.propertyName),
				t.labelName,
			],
			color: ui?.chart5 ?? ui?.primary ?? ui?.foreground,
		},
		{
			tag: [t.propertyName, t.attributeName],
			color: ui?.foreground ?? "#f5f5f5",
		},
		{
			tag: [t.variableName, t.name, t.deleted, t.character],
			color: ui?.foreground ?? "#f5f5f5",
		},
		{
			tag: [t.link, t.url, t.escape],
			color: ui?.primary ?? ui?.chart1 ?? ui?.foreground,
			textDecoration: "underline",
		},
		{ tag: [t.invalid], color: ui?.destructive ?? "#ef4444" },
		{
			tag: [t.brace, t.squareBracket, t.paren, t.separator, t.punctuation],
			color: ui?.mutedForeground ?? ui?.foreground,
		},
	]);

	return syntaxHighlighting(styles);
}

export function getDiffViewerStyle(
	theme: Theme | null,
	fontSettings: CodeThemeFontSettings,
): CSSProperties {
	const ui = theme?.ui;
	const fontFamily = fontSettings.fontFamily ?? DEFAULT_CODE_EDITOR_FONT_FAMILY;
	const fontSize = fontSettings.fontSize ?? DEFAULT_CODE_EDITOR_FONT_SIZE;
	const lineHeight = Math.round(fontSize * 1.5);

	return {
		"--diffs-font-family": fontFamily,
		"--diffs-font-size": `${fontSize}px`,
		"--diffs-line-height": `${lineHeight}px`,
		"--diffs-bg-buffer-override": ui?.tertiary ?? ui?.card ?? ui?.background,
		"--diffs-bg-hover-override": ui?.muted ?? ui?.accent ?? ui?.background,
		"--diffs-bg-context-override": ui?.background,
		"--diffs-bg-separator-override": ui?.card ?? ui?.muted ?? ui?.background,
		"--diffs-fg-number-override": ui?.mutedForeground ?? ui?.foreground,
		"--diffs-addition-color-override": ui?.chart2 ?? "#22c55e",
		"--diffs-deletion-color-override": ui?.destructive ?? "#ef4444",
		"--diffs-modified-color-override": ui?.chart1 ?? ui?.primary ?? "#3b82f6",
		"--diffs-selection-color-override": ui?.primary ?? ui?.chart1 ?? "#3b82f6",
	} as CSSProperties;
}
