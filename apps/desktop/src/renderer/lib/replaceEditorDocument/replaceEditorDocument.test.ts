import { describe, expect, it } from "bun:test";
import { EditorSelection, EditorState } from "@codemirror/state";
import { replaceEditorDocument } from "./replaceEditorDocument";

function stateWith(doc: string, selection: EditorSelection) {
	return EditorState.create({
		doc,
		selection,
		extensions: [EditorState.allowMultipleSelections.of(true)],
	});
}

describe("replaceEditorDocument", () => {
	it("keeps a selected range editable after the document is swapped", () => {
		const before = stateWith("a".repeat(100), EditorSelection.single(10, 40));
		const after = before.update(
			replaceEditorDocument(before, "b".repeat(2840)),
		).state;

		const { from, to } = after.selection.main;
		expect(from).toBeLessThanOrEqual(to);
		expect(() => after.replaceSelection("x")).not.toThrow();
	});

	it("keeps the cursor at its offset in the new content", () => {
		const before = stateWith("a".repeat(100), EditorSelection.single(40));
		const after = before.update(
			replaceEditorDocument(before, "b".repeat(200)),
		).state;

		expect(after.selection.main.head).toBe(40);
	});

	it("clamps the cursor when the new content is shorter", () => {
		const before = stateWith("a".repeat(100), EditorSelection.single(90));
		const after = before.update(replaceEditorDocument(before, "short")).state;

		expect(after.selection.main.head).toBe(5);
		expect(after.doc.toString()).toBe("short");
	});

	it("never leaves the cursor inside a grapheme cluster of the new content", () => {
		const before = stateWith("a".repeat(100), EditorSelection.single(3));
		const after = before.update(replaceEditorDocument(before, "ab😀cd")).state;

		const { head } = after.selection.main;
		expect(head).toBe(2);
		expect(after.sliceDoc(head)).toBe("😀cd");
	});

	it("measures the cursor against the normalized document, not the raw string", () => {
		const before = stateWith("a".repeat(100), EditorSelection.single(100));
		const after = before.update(
			replaceEditorDocument(before, "ab\r\ncd\r\n"),
		).state;

		expect(after.doc.toString()).toBe("ab\ncd\n");
		expect(after.selection.main.head).toBe(after.doc.length);
	});

	it("collapses multiple selections to one cursor", () => {
		const before = stateWith(
			"a".repeat(100),
			EditorSelection.create([
				EditorSelection.range(5, 10),
				EditorSelection.range(20, 30),
			]),
		);
		const after = before.update(
			replaceEditorDocument(before, "b".repeat(100)),
		).state;

		expect(after.selection.ranges).toHaveLength(1);
		expect(after.selection.main.empty).toBe(true);
	});
});
