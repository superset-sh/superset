import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import { getEditorTheme, type Theme } from "shared/themes";

export function getEditorHighlightStyle(theme: Theme): HighlightStyle {
	const editorTheme = getEditorTheme(theme);

	return HighlightStyle.define([
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
		{
			tag: [
				tags.heading,
				tags.heading1,
				tags.heading2,
				tags.heading3,
				tags.heading4,
				tags.heading5,
				tags.heading6,
			],
			color: editorTheme.syntax.keyword,
			fontWeight: "bold",
		},
		{
			tag: [tags.strong],
			fontWeight: "bold",
		},
		{
			tag: [tags.emphasis],
			fontStyle: "italic",
		},
		{
			tag: [tags.strikethrough],
			textDecoration: "line-through",
		},
		{
			tag: [tags.link],
			color: editorTheme.syntax.tagName,
			textDecoration: "underline",
		},
		{
			tag: [tags.url],
			color: editorTheme.syntax.string,
			textDecoration: "underline",
		},
		{
			tag: [tags.monospace],
			color: editorTheme.syntax.string,
		},
		{
			tag: [tags.list],
			color: editorTheme.syntax.keyword,
		},
		{
			tag: [tags.quote],
			color: editorTheme.syntax.comment,
			fontStyle: "italic",
		},
		{
			tag: [tags.contentSeparator],
			color: editorTheme.syntax.comment,
		},
		{
			tag: [tags.processingInstruction],
			color: editorTheme.syntax.comment,
		},
		{
			tag: [tags.character],
			color: editorTheme.syntax.constant,
		},
	]);
}

export function getCodeSyntaxHighlighting(theme: Theme): Extension {
	return syntaxHighlighting(getEditorHighlightStyle(theme));
}
