import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import type { DiffsThemeNames } from "@pierre/diffs/react";
import type { CSSProperties } from "react";
import { getTerminalColors, type Theme } from "shared/themes";
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
	dark: { light: "github-light-default", dark: "vitesse-dark" },
	light: { light: "github-light-default", dark: "github-dark-default" },
	"one-dark": { light: "one-light", dark: "one-dark-pro" },
	monokai: { light: "one-light", dark: "monokai" },
	ember: { light: "one-light", dark: "vitesse-dark" },
};

const DEFAULT_SHIKI_THEME = {
	light: "github-light-default" as DiffsThemeNames,
	dark: "github-dark-default" as DiffsThemeNames,
};

function getTerminalTone(
	theme: Theme | null,
	normal: string | undefined,
	bright: string | undefined,
) {
	if (theme?.type === "light") {
		return normal ?? bright;
	}

	return bright ?? normal;
}

export function getDiffsTheme(theme: Theme | null) {
	const themeId = theme?.id ?? "dark";
	return SHIKI_THEME_MAP[themeId] ?? DEFAULT_SHIKI_THEME;
}

export function getCodeSyntaxHighlighting(theme: Theme | null): Extension {
	const ui = theme?.ui;
	const terminal = theme ? getTerminalColors(theme) : null;
	const styles = HighlightStyle.define([
		{
			tag: [t.keyword, t.modifier, t.controlKeyword],
			color:
				getTerminalTone(theme, terminal?.magenta, terminal?.brightMagenta) ??
				ui?.primary,
			fontWeight: "600",
		},
		{
			tag: [t.operatorKeyword, t.operator],
			color:
				getTerminalTone(theme, terminal?.magenta, terminal?.brightMagenta) ??
				ui?.mutedForeground ??
				ui?.foreground,
		},
		{
			tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
			color: ui?.mutedForeground ?? "#6b7280",
			fontStyle: "italic",
		},
		{
			tag: [t.string, t.special(t.string), t.regexp],
			color:
				getTerminalTone(theme, terminal?.green, terminal?.brightGreen) ??
				ui?.primary,
		},
		{
			tag: [t.number, t.bool, t.null, t.atom],
			color:
				getTerminalTone(theme, terminal?.yellow, terminal?.brightYellow) ??
				ui?.primary,
		},
		{
			tag: [t.className, t.typeName, t.namespace, t.definition(t.typeName)],
			color:
				getTerminalTone(theme, terminal?.blue, terminal?.brightBlue) ??
				ui?.primary,
		},
		{
			tag: [
				t.function(t.variableName),
				t.function(t.propertyName),
				t.labelName,
			],
			color:
				getTerminalTone(theme, terminal?.cyan, terminal?.brightCyan) ??
				ui?.primary,
		},
		{
			tag: [t.propertyName, t.attributeName],
			color:
				getTerminalTone(theme, terminal?.cyan, terminal?.brightCyan) ??
				ui?.foreground ??
				"#f5f5f5",
		},
		{
			tag: [t.variableName, t.name, t.deleted, t.character],
			color: ui?.foreground ?? "#f5f5f5",
		},
		{
			tag: [t.link, t.url, t.escape],
			color:
				getTerminalTone(theme, terminal?.blue, terminal?.brightBlue) ??
				ui?.primary,
			textDecoration: "underline",
		},
		{
			tag: [t.invalid],
			color:
				getTerminalTone(theme, terminal?.red, terminal?.brightRed) ??
				ui?.destructive ??
				"#ef4444",
		},
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
