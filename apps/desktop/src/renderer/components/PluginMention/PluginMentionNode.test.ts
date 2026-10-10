const { describe, expect, it } = await import("bun:test");
const { Editor } = await import("@tiptap/core");
const { default: Document } = await import("@tiptap/extension-document");
const { default: Paragraph } = await import("@tiptap/extension-paragraph");
const { default: Text } = await import("@tiptap/extension-text");
const { Markdown } = await import("tiptap-markdown");
const { PluginMentionNode } = await import("./PluginMentionNode");

const PLUGINS = [
	{ name: "linear", displayName: "Linear", description: "Issues" },
	{ name: "notion", displayName: "Notion", description: "Pages" },
];

function load(markdown: string) {
	const editor = new Editor({
		extensions: [
			Document,
			Paragraph,
			Text,
			PluginMentionNode.configure({
				resolvePlugin: (name) =>
					PLUGINS.find((plugin) => plugin.name === name) ?? null,
			}),
			Markdown.configure({ html: true }),
		],
		content: markdown,
	});
	const storage = editor.storage as unknown as Record<
		string,
		{ getMarkdown?: () => string }
	>;
	const mentions: { name: string; label: string }[] = [];
	editor.state.doc.descendants((node) => {
		if (node.type.name === "plugin-mention") {
			mentions.push(node.attrs as { name: string; label: string });
		}
	});
	const saved = storage.markdown?.getMarkdown?.() ?? "";
	const text = editor.getText();
	editor.destroy();
	return { mentions, saved, text };
}

describe("PluginMentionNode", () => {
	it("reads @plugin handles back as mentions and writes them unchanged", () => {
		const markdown = "Ask @linear to file it, then summarize in @notion.";
		const { mentions, saved, text } = load(markdown);
		expect(mentions).toEqual([
			{ name: "linear", label: "Linear" },
			{ name: "notion", label: "Notion" },
		]);
		expect(saved).toBe(markdown);
		expect(text).toBe(markdown);
	});

	it("leaves unknown handles, mid-word @ and emails as text", () => {
		const markdown =
			"Mail avi@linear.app about @slack, @linearé and foo@notion";
		const { mentions, saved } = load(markdown);
		expect(mentions).toEqual([]);
		expect(saved).toBe(markdown);
	});

	it("keeps a mention at the start of a line", () => {
		const { mentions, saved } = load("@linear triage the inbox");
		expect(mentions).toEqual([{ name: "linear", label: "Linear" }]);
		expect(saved).toBe("@linear triage the inbox");
	});

	it("writes a space between a chip and a word glued to it, in markdown and text", () => {
		const editor = new Editor({
			extensions: [
				Document,
				Paragraph,
				Text,
				PluginMentionNode.configure({
					resolvePlugin: (name) =>
						PLUGINS.find((plugin) => plugin.name === name) ?? null,
				}),
				Markdown.configure({ html: true }),
			],
			content: {
				type: "doc",
				content: [
					{
						type: "paragraph",
						content: [
							{
								type: "plugin-mention",
								attrs: { name: "linear", label: "Linear" },
							},
							{ type: "text", text: "file an issue, " },
							{
								type: "plugin-mention",
								attrs: { name: "notion", label: "Notion" },
							},
							{ type: "text", text: ", please" },
						],
					},
				],
			},
		});
		const storage = editor.storage as unknown as Record<
			string,
			{ getMarkdown?: () => string }
		>;
		expect(storage.markdown?.getMarkdown?.()).toBe(
			"@linear file an issue, @notion, please",
		);
		expect(editor.getText()).toBe("@linear file an issue, @notion, please");
		editor.destroy();
	});

	it("separates a word typed right after a chip, but not punctuation", () => {
		const editor = new Editor({
			extensions: [
				Document,
				Paragraph,
				Text,
				PluginMentionNode.configure({
					resolvePlugin: (name) =>
						PLUGINS.find((plugin) => plugin.name === name) ?? null,
				}),
				Markdown.configure({ html: true }),
			],
			content: "@linear",
		});
		const typeAtEnd = (text: string) => {
			const end = editor.state.doc.content.size - 1;
			const fallback = () => editor.state.tr.insertText(text, end);
			const handled = editor.view.someProp("handleTextInput", (handler) =>
				handler(editor.view, end, end, text, fallback),
			);
			if (!handled) editor.view.dispatch(fallback());
		};
		typeAtEnd("f");
		expect(editor.getText()).toBe("@linear f");
		editor.commands.setContent("@linear");
		typeAtEnd(",");
		expect(editor.getText()).toBe("@linear,");
		editor.destroy();
	});
});
