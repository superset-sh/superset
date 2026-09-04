import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document — TipTap's Editor needs
// real DOM APIs. bun runs test files sequentially in one process and
// happy-dom's globals are process-wide, so register once and unregister after.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

const { afterAll, describe, expect, it } = await import("bun:test");
const { Editor } = await import("@tiptap/core");
const { Document } = await import("@tiptap/extension-document");
const { Paragraph } = await import("@tiptap/extension-paragraph");
const { Markdown } = await import("tiptap-markdown");
const { TextWithoutHtmlEscape } = await import("./text-without-html-escape");

afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/** Mirrors MarkdownEditor's markdown-relevant extension set. */
function buildEditor() {
	return new Editor({
		extensions: [
			Document,
			Paragraph,
			TextWithoutHtmlEscape,
			Markdown.configure({
				html: false,
				transformPastedText: true,
				transformCopiedText: true,
			}),
		],
		content: "",
	});
}

function getMarkdown(editor: ReturnType<typeof buildEditor>): string {
	const storage = editor.storage as unknown as Record<
		string,
		{ getMarkdown?: () => string }
	>;
	return storage.markdown?.getMarkdown?.() ?? "";
}

/** Serializes a document holding exactly the text a user typed. */
function serializeTyped(text: string): string {
	const editor = buildEditor();
	editor.commands.setContent({
		type: "doc",
		content: [{ type: "paragraph", content: [{ type: "text", text }] }],
	});
	return getMarkdown(editor);
}

describe("TextWithoutHtmlEscape", () => {
	it("keeps angle brackets as typed", () => {
		// Stock tiptap-markdown emits "2 &gt; 1 and a &lt; b", which reaches
		// agent CLIs verbatim over the launch heredoc.
		expect(serializeTyped("2 > 1 and a < b")).toBe("2 > 1 and a < b");
	});

	it("keeps shell redirects and generics intact", () => {
		expect(serializeTyped("run build > out.log")).toBe("run build > out.log");
		expect(serializeTyped("returns Array<string>")).toBe(
			"returns Array<string>",
		);
	});

	it("does not rewrite a literal entity the user typed", () => {
		expect(serializeTyped("&gt;")).toBe("&gt;");
	});

	it("still escapes real markdown syntax", () => {
		expect(serializeTyped("a * b")).toBe("a \\* b");
	});
});

/**
 * MarkdownEditor is uncontrolled after mount but re-parses `content` whenever
 * its key changes (the new-workspace composer remounts on prompt seeding and
 * reset). Serializing without the HTML escape is only safe because the editor
 * also parses with html:false — otherwise the reload reads angle brackets as
 * markup and drops them. These cover that pair together.
 */
function reload(typed: string): { markdown: string; afterReload: string } {
	const write = buildEditor();
	write.commands.setContent({
		type: "doc",
		content: [{ type: "paragraph", content: [{ type: "text", text: typed }] }],
	});
	const markdown = getMarkdown(write);

	const read = buildEditor();
	read.commands.setContent(markdown);
	return { markdown, afterReload: read.state.doc.textContent };
}

describe("MarkdownEditor reload round trip", () => {
	it("keeps a generic type through a remount", () => {
		// With html:true this reloaded as "returns Array" — <string> was markup.
		expect(reload("returns Array<string>")).toEqual({
			markdown: "returns Array<string>",
			afterReload: "returns Array<string>",
		});
	});

	it("keeps HTML-looking text through a remount", () => {
		// With html:true this reloaded as "text".
		expect(reload("<b>text</b>")).toEqual({
			markdown: "<b>text</b>",
			afterReload: "<b>text</b>",
		});
	});

	it("keeps a shell redirect through a remount", () => {
		expect(reload("run build > out.log")).toEqual({
			markdown: "run build > out.log",
			afterReload: "run build > out.log",
		});
	});

	it("decodes a typed entity on reload, which markdown-it always does", () => {
		// Documented, not endorsed: markdown-it's entity rule runs regardless of
		// the html option, so `&gt;` cannot survive the parser as its spelling.
		// It reached the agent as `&gt;` before this change either way.
		expect(reload("&gt;")).toEqual({ markdown: "&gt;", afterReload: ">" });
	});
});
