import { describe, expect, test } from "bun:test";
import { tags } from "@lezer/highlight";
import { darkTheme } from "shared/themes";
import { getEditorHighlightStyle } from "./syntax-highlighting";

describe("getEditorHighlightStyle", () => {
	const style = getEditorHighlightStyle(darkTheme);

	test("styles non-markdown tags it always supported", () => {
		expect(style.style([tags.keyword])).not.toBeNull();
		expect(style.style([tags.string])).not.toBeNull();
		expect(style.style([tags.comment])).not.toBeNull();
	});

	test.each([
		["heading", tags.heading],
		["heading1", tags.heading1],
		["heading2", tags.heading2],
		["heading3", tags.heading3],
		["heading4", tags.heading4],
		["heading5", tags.heading5],
		["heading6", tags.heading6],
		["strong (bold)", tags.strong],
		["emphasis (italic)", tags.emphasis],
		["link", tags.link],
		["url", tags.url],
		["monospace (inline code)", tags.monospace],
		["list", tags.list],
		["quote (blockquote)", tags.quote],
		["contentSeparator (horizontal rule)", tags.contentSeparator],
		["processingInstruction (markup punctuation)", tags.processingInstruction],
	])("styles markdown tag: %s", (_name, tag) => {
		expect(style.style([tag])).not.toBeNull();
	});
});
