import type { JSONContent } from "@tiptap/core";

const { describe, expect, it } = await import("bun:test");
const { Editor } = await import("@tiptap/core");
const { default: Document } = await import("@tiptap/extension-document");
const { default: Paragraph } = await import("@tiptap/extension-paragraph");
const { default: Text } = await import("@tiptap/extension-text");
const { PluginMentionNode } = await import("renderer/components/PluginMention");
const { FileMentionNode } = await import("./FileMentionNode");
const { parseTextToEditorContent } = await import("./parseTextToEditorContent");
const { serializeEditorToText } = await import("./serializeEditorToText");

const linear = { name: "linear", displayName: "Linear", description: "" };

function serialize(content: JSONContent, plugins = [linear]) {
	const editor = new Editor({
		extensions: [Document, Paragraph, Text, FileMentionNode, PluginMentionNode],
		content,
	});
	const text = serializeEditorToText(editor, plugins);
	editor.destroy();
	return text;
}

describe("serializeEditorToText", () => {
	it("writes a plugin mention as its handle", () => {
		expect(
			serialize({
				type: "doc",
				content: [
					{
						type: "paragraph",
						content: [
							{ type: "text", text: "Ask " },
							{
								type: "plugin-mention",
								attrs: { name: "linear", label: "Linear" },
							},
							{ type: "text", text: " to file it" },
						],
					},
				],
			}),
		).toBe("Ask @linear to file it");
	});

	it("writes a space between a chip and a word glued to it", () => {
		expect(
			serialize({
				type: "doc",
				content: [
					{
						type: "paragraph",
						content: [
							{
								type: "plugin-mention",
								attrs: { name: "linear", label: "Linear" },
							},
							{ type: "text", text: "file it, " },
							{
								type: "plugin-mention",
								attrs: { name: "linear", label: "Linear" },
							},
							{ type: "text", text: "." },
						],
					},
				],
			}),
		).toBe("@linear file it, @linear.");
	});

	it("round-trips a multi-line draft with quoted paths through the parser", () => {
		const doc: JSONContent = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "Compare " },
						{ type: "file-mention", attrs: { path: "docs/My Notes/plan.md" } },
						{ type: "text", text: " with " },
						{ type: "file-mention", attrs: { path: "src/app.ts" } },
					],
				},
				{ type: "paragraph" },
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "then ask " },
						{
							type: "plugin-mention",
							attrs: { name: "linear", label: "Linear" },
						},
						{ type: "text", text: " to file it" },
					],
				},
			],
		};
		const text = serialize(doc);
		expect(text).toBe(
			'Compare @"docs/My Notes/plan.md" with @src/app.ts\n\nthen ask @linear to file it',
		);
		expect(parseTextToEditorContent(text, [linear])).toEqual({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "Compare " },
						{
							type: "file-mention",
							attrs: { path: "docs/My Notes/plan.md", fromText: false },
						},
						{ type: "text", text: " with " },
						{
							type: "file-mention",
							attrs: { path: "src/app.ts", fromText: true },
						},
					],
				},
				{ type: "paragraph" },
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "then ask " },
						{
							type: "plugin-mention",
							attrs: { name: "linear", label: "Linear" },
						},
						{ type: "text", text: " to file it" },
					],
				},
			],
		});
	});

	it("keeps a bare handle restored before the catalog loaded as a bare handle", () => {
		const restored = parseTextToEditorContent("@linear", []);
		expect(restored.content?.[0]?.content).toEqual([
			{ type: "file-mention", attrs: { path: "linear", fromText: true } },
		]);
		expect(serialize(restored, [linear])).toBe("@linear");
	});

	it("quotes a file path that spells an installed plugin so it reads back as a file", () => {
		const doc = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "file-mention", attrs: { path: "linear" } }],
				},
			],
		};
		expect(serialize(doc)).toBe('@"linear"');
		expect(serialize(doc, [])).toBe("@linear");
		expect(
			parseTextToEditorContent('@"linear"', [linear]).content?.[0]?.content,
		).toEqual([
			{ type: "file-mention", attrs: { path: "linear", fromText: false } },
		]);
	});
});
