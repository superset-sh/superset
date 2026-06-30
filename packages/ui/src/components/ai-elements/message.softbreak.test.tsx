import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
// NOTE: deliberately a separate file from message.test.tsx so the real
// `streamdown` is used (message.test.tsx mocks it, which would bypass markdown
// parsing entirely).
import { MessageResponse } from "./message";

/**
 * Strip tags and compute the text a user actually sees, honoring the paragraph's
 * CSS `white-space` value:
 *  - normal/nowrap: a soft line break (`\n`) collapses to a single space
 *  - pre-wrap/pre-line/pre: a soft line break is a hard break with NO space
 */
function visibleParagraphText(html: string): string {
	const pMatch = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/);
	if (!pMatch) {
		throw new Error("no <p> found in rendered output");
	}
	const isPreserved = /whitespace-pre(-wrap|-line)?\b/.test(html);
	const text = pMatch[1].replace(/<[^>]+>/g, "");
	// A user reads consecutive words; a hard break introduces no space, while a
	// collapsed soft break introduces exactly one space.
	return isPreserved
		? text.replace(/\n+/g, "")
		: text.replace(/\s+/g, " ").trim();
}

describe("MessageResponse soft line breaks (issue #5286)", () => {
	// `it.failing` documents a known bug: the assertion below describes the
	// CORRECT (CommonMark) behavior, which currently fails. When the bug is
	// fixed this test will start passing and `it.failing` will flag it, prompting
	// removal of `.failing`.
	it.failing("keeps a space between a bold word at the end of a soft-wrapped line and the first word of the next line", () => {
		// Source markdown wraps a single sentence across two lines:
		//   This is a **bold**
		//   word.
		// CommonMark renders the soft line break as a single space, so the
		// expected output is "This is a bold word."
		const html = renderToStaticMarkup(
			<MessageResponse>{"This is a **bold**\nword."}</MessageResponse>,
		);

		expect(visibleParagraphText(html)).toBe("This is a bold word.");
	});
});
