import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

const { afterAll, describe, expect, it } = await import("bun:test");
const { Editor } = await import("@tiptap/core");
const { default: Document } = await import("@tiptap/extension-document");
const { default: Paragraph } = await import("@tiptap/extension-paragraph");
const { default: Text } = await import("@tiptap/extension-text");
const { default: Link } = await import("@tiptap/extension-link");
const { Markdown } = await import("tiptap-markdown");
const { RecordMentionNode } = await import("./RecordMentionNode");

afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function load(markdown: string) {
	const editor = new Editor({
		extensions: [
			Document,
			Paragraph,
			Text,
			Link,
			RecordMentionNode,
			Markdown.configure({ html: true }),
		],
		content: markdown,
	});
	const storage = editor.storage as unknown as Record<
		string,
		{ getMarkdown?: () => string }
	>;
	const mentions: { kind: string; id: string; label: string }[] = [];
	editor.state.doc.descendants((node) => {
		if (node.type.name === "record-mention") {
			mentions.push(node.attrs as { kind: string; id: string; label: string });
		}
	});
	const saved = storage.markdown?.getMarkdown?.() ?? "";
	editor.destroy();
	return { mentions, saved };
}

describe("RecordMentionNode", () => {
	it("reads saved mentions back as mentions and writes them unchanged", () => {
		const markdown =
			"Ask [@Avi Peltz](superset://users/u1) about [SUPER-12 Fix the sidebar](superset://tasks/t1) and [#7888 feat: rows](https://github.com/superset-sh/superset/pull/7888)";
		const { mentions, saved } = load(markdown);
		expect(mentions).toEqual([
			{ kind: "person", id: "u1", label: "Avi Peltz" },
			{ kind: "task", id: "t1", label: "SUPER-12 Fix the sidebar" },
			{
				kind: "pull_request",
				id: "https://github.com/superset-sh/superset/pull/7888",
				label: "#7888 feat: rows",
			},
		]);
		expect(saved).toBe(markdown);
	});

	it("keeps markdown and HTML characters in a label through a round trip", () => {
		const label = "SUPER-9 Fix `useFoo` *crash* <Suspense> & [x]";
		const markdown =
			"See [SUPER-9 Fix \\`useFoo\\` \\*crash\\* &lt;Suspense&gt; &amp; \\[x\\]](superset://tasks/t1)";
		const { mentions, saved } = load(markdown);
		expect(mentions).toEqual([{ kind: "task", id: "t1", label }]);
		expect(saved).toBe(markdown);
	});

	it("leaves an ordinary link to a pull request as a link", () => {
		const markdown =
			"See [the fix](https://github.com/superset-sh/superset/pull/7888)";
		const { mentions, saved } = load(markdown);
		expect(mentions).toEqual([]);
		expect(saved).toBe(markdown);
	});
});
