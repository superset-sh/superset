import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document — TipTap's Editor needs
// real DOM APIs. bun runs test files sequentially in one process and
// happy-dom's globals are process-wide, so register once and unregister after.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

const { afterAll, describe, expect, it } = await import("bun:test");
const { Editor } = await import("@tiptap/core");
const { createMarkdownExtensions } = await import("./createMarkdownExtensions");
const { mergeMarkdownEdits } = await import("./mergeMarkdownEdits");
const { applyExternalMarkdown } = await import("./TipTapMarkdownRenderer");

afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function getMarkdown(editor: InstanceType<typeof Editor>): string {
	const storage = editor.storage as unknown as Record<
		string,
		{ getMarkdown?: () => string }
	>;
	return storage.markdown?.getMarkdown?.() ?? "";
}

/**
 * Runs `original` through the real production pipeline: parse into the
 * editor, capture the serializer baseline, apply `edit` as a real editor
 * transaction, serialize, and merge back onto the original.
 */
function editAndMerge(
	original: string,
	edit: (editor: InstanceType<typeof Editor>) => void,
): { merged: string; baseline: string; edited: string } {
	const editor = new Editor({
		editable: true,
		extensions: createMarkdownExtensions({
			editable: true,
			onSaveRef: { current: undefined },
		}),
		content: original,
	});
	try {
		const baseline = getMarkdown(editor);
		edit(editor);
		const edited = getMarkdown(editor);
		return {
			merged: mergeMarkdownEdits(original, baseline, edited),
			baseline,
			edited,
		};
	} finally {
		editor.destroy();
	}
}

/** Replaces the first occurrence of `find` in the doc's text with `replace`. */
function replaceText(
	editor: InstanceType<typeof Editor>,
	find: string,
	replace: string,
) {
	let done = false;
	editor.state.doc.descendants((node, pos) => {
		if (done || !node.isText || !node.text) return;
		const index = node.text.indexOf(find);
		if (index === -1) return;
		editor
			.chain()
			.setTextSelection({ from: pos + index, to: pos + index + find.length })
			.insertContent(replace)
			.run();
		done = true;
	});
	if (!done) throw new Error(`text not found in doc: ${find}`);
}

function appendParagraph(editor: InstanceType<typeof Editor>, text: string) {
	editor
		.chain()
		.insertContentAt(editor.state.doc.content.size, {
			type: "paragraph",
			content: [{ type: "text", text }],
		})
		.run();
}

const FIXTURE = `Project Title
=============

A hard-wrapped intro paragraph
that spans multiple lines
in the original source.

* first bullet with star marker
* second bullet

<!-- keep this comment -->

| Column A | Column B |
|:---------|---------:|
| a        |        b |

Some text with snake_case_identifiers and *emphasis*.

1. one
1. also one style numbering
1. three
`;

describe("mergeMarkdownEdits round-trip through production extensions", () => {
	it("serializer baseline actually normalizes the fixture (sanity check)", () => {
		const { baseline } = editAndMerge(FIXTURE, () => {});
		// If none of these hold the fixture stopped exercising normalization
		// and the suite is vacuous.
		expect(baseline).not.toBe(FIXTURE);
		expect(baseline).toContain("# Project Title");
		expect(baseline).not.toContain("<!-- keep this comment -->");
	});

	it("no edit → file byte-identical", () => {
		const { merged } = editAndMerge(FIXTURE, () => {});
		expect(merged).toBe(FIXTURE);
	});

	it("appending a paragraph keeps every original byte and adds the paragraph", () => {
		const { merged } = editAndMerge(FIXTURE, (editor) => {
			appendParagraph(editor, "A brand-new closing paragraph.");
		});
		expect(merged.startsWith(FIXTURE.trimEnd())).toBe(true);
		expect(merged).toContain("A brand-new closing paragraph.");
		expect(merged.endsWith("\n")).toBe(true);
	});

	it("editing the intro keeps setext title, bullets, comment, and table verbatim", () => {
		const { merged } = editAndMerge(FIXTURE, (editor) => {
			replaceText(editor, "hard-wrapped intro", "revised intro");
		});
		expect(merged).toContain("Project Title\n=============");
		expect(merged).toContain("* first bullet with star marker");
		expect(merged).toContain("<!-- keep this comment -->");
		expect(merged).toContain("|:---------|---------:|");
		expect(merged).toContain("1. also one style numbering");
		expect(merged).toContain("revised intro");
		// The edited paragraph itself is re-serialized: it unwraps.
		expect(merged).not.toContain("A hard-wrapped intro paragraph\nthat");
	});

	it("editing a bullet normalizes only the list, not the rest", () => {
		const { merged } = editAndMerge(FIXTURE, (editor) => {
			replaceText(editor, "second bullet", "second bullet edited");
		});
		expect(merged).toContain("second bullet edited");
		expect(merged).toContain("Project Title\n=============");
		expect(merged).toContain(
			"A hard-wrapped intro paragraph\nthat spans multiple lines",
		);
		expect(merged).toContain("<!-- keep this comment -->");
		expect(merged).toContain("snake_case_identifiers");
	});

	it("editing text next to the dropped HTML comment keeps the comment", () => {
		const { merged } = editAndMerge(FIXTURE, (editor) => {
			replaceText(editor, "Some text with", "Rewritten text with");
		});
		expect(merged).toContain("<!-- keep this comment -->");
		expect(merged).toContain("Rewritten text with");
		expect(merged).toContain("* first bullet with star marker");
	});

	it("front matter survives edits elsewhere", () => {
		const original = `---\ntitle: hello\ntags: [a, b]\n---\n\nBody paragraph.\n`;
		const { merged } = editAndMerge(original, (editor) => {
			replaceText(editor, "Body paragraph.", "Body paragraph, edited.");
		});
		expect(merged).toContain("---\ntitle: hello\ntags: [a, b]\n---");
		expect(merged).toContain("Body paragraph, edited.");
	});

	it("undo-equivalent (revert to baseline content) returns the original bytes", () => {
		const { merged } = editAndMerge(FIXTURE, (editor) => {
			replaceText(editor, "hard-wrapped", "TEMP");
			replaceText(editor, "TEMP", "hard-wrapped");
		});
		expect(merged).toBe(FIXTURE);
	});

	it("undo cannot cross an external reload and resurrect stale content", () => {
		const editor = new Editor({
			editable: true,
			extensions: createMarkdownExtensions({
				editable: true,
				onSaveRef: { current: undefined },
			}),
			content: "Original paragraph.\n",
		});
		try {
			// Simulate a user edit, then an external reload replacing the doc.
			editor.chain().setTextSelection(2).insertContent("XX").run();
			applyExternalMarkdown(
				editor,
				"Reloaded paragraph.\n\nExternally added line.\n",
			);
			const afterReload = editor.state.doc.textContent;
			editor.commands.undo();
			expect(editor.state.doc.textContent).toBe(afterReload);
			expect(editor.state.doc.textContent).toContain("Externally added line.");
		} finally {
			editor.destroy();
		}
	});

	it("deleting one block keeps the neighbors byte-identical", () => {
		const { merged } = editAndMerge(FIXTURE, (editor) => {
			// Delete the paragraph containing snake_case_identifiers.
			editor.state.doc.descendants((node, pos) => {
				if (
					node.type.name === "paragraph" &&
					node.textContent.includes("snake_case_identifiers")
				) {
					editor
						.chain()
						.deleteRange({ from: pos, to: pos + node.nodeSize })
						.run();
					return false;
				}
			});
		});
		expect(merged).not.toContain("snake_case_identifiers");
		expect(merged).toContain("* first bullet with star marker");
		expect(merged).toContain("|:---------|---------:|");
		expect(merged).toContain("1. also one style numbering");
	});
});
