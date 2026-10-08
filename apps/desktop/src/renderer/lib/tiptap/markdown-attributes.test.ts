const { describe, expect, it } = await import("bun:test");
const { Editor } = await import("@tiptap/core");
const { default: Document } = await import("@tiptap/extension-document");
const { default: Paragraph } = await import("@tiptap/extension-paragraph");
const { default: Text } = await import("@tiptap/extension-text");
const { Markdown } = await import("tiptap-markdown");
const { SafeLink } = await import("./markdown-attributes");

function createEditor() {
	return new Editor({
		element: document.createElement("div"),
		extensions: [
			Document,
			Paragraph,
			Text,
			SafeLink,
			Markdown.configure({ html: true, transformPastedText: true }),
		],
	});
}

function typeText(editor: InstanceType<typeof Editor>, text: string) {
	for (const char of text) {
		const { from, to } = editor.state.selection;
		editor.view.dispatch(editor.state.tr.insertText(char, from, to));
	}
}

function linkedText(editor: InstanceType<typeof Editor>) {
	const linked: string[] = [];
	editor.state.doc.descendants((node) => {
		if (node.isText && node.marks.some((mark) => mark.type.name === "link")) {
			linked.push(node.text ?? "");
		}
	});
	return linked;
}

describe("SafeLink", () => {
	it("does not grow a pasted link over the text typed after it", () => {
		const url = "https://github.com/superset-sh/superset";
		const editor = createEditor();
		editor.view.pasteText(url);
		typeText(editor, " to the prompt input");

		expect(editor.state.doc.textContent).toBe(`${url} to the prompt input`);
		expect(linkedText(editor)).toEqual([url]);
		editor.destroy();
	});
});
