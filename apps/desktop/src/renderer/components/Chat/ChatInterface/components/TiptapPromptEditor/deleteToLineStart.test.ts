import { describe, expect, test } from "bun:test";
import { type Node, Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { deleteToLineStart, findLineStartFromPos } from "./deleteToLineStart";

const schema = new Schema({
	nodes: {
		doc: { content: "block+" },
		paragraph: {
			group: "block",
			content: "inline*",
			toDOM: () => ["p", 0],
		},
		hardBreak: {
			inline: true,
			group: "inline",
			selectable: false,
			toDOM: () => ["br"],
		},
		text: { group: "inline" },
	},
});

const t = (s: string) => schema.text(s);
const br = () => schema.nodes.hardBreak.create();
const p = (...content: Node[]) => schema.nodes.paragraph.create(null, content);
const buildDoc = (...paragraphs: Node[]) =>
	schema.nodes.doc.create(null, paragraphs);

const stateAt = (doc: Node, pos: number) =>
	EditorState.create({
		doc,
		selection: TextSelection.create(doc, pos),
	});

const applyCmdBackspace = (state: EditorState): EditorState => {
	let next = state;
	const handled = deleteToLineStart(state, (tr) => {
		next = state.apply(tr);
	});
	if (!handled) return state;
	return next;
};

describe("findLineStartFromPos", () => {
	test("returns position after the previous hardBreak when cursor is at end of last line", () => {
		const doc = buildDoc(
			p(t("line one"), br(), t("line two"), br(), t("line three")),
		);
		// Pos at end of "line three": 1 (paragraph open) + 8 + 1 + 8 + 1 + 10 = 29
		expect(findLineStartFromPos(doc, 29)).toBe(19);
	});

	test("returns paragraph start when there is no previous hardBreak", () => {
		const doc = buildDoc(p(t("line one")));
		// Pos at end of "line one": 1 + 8 = 9
		expect(findLineStartFromPos(doc, 9)).toBe(1);
	});

	test("returns the start of the second paragraph when cursor is at end of it", () => {
		const doc = buildDoc(p(t("line one")), p(t("line two")));
		// Paragraph 2 content starts at 11; end of "line two" at 19
		expect(findLineStartFromPos(doc, 19)).toBe(11);
	});

	test("returns null when cursor is already at the start of a line", () => {
		const doc = buildDoc(p(t("line one"), br(), t("line two")));
		// Position right after the hardBreak (start of "line two") = 1 + 8 + 1 = 10
		expect(findLineStartFromPos(doc, 10)).toBeNull();
	});
});

describe("deleteToLineStart command", () => {
	test("deletes only the last line in a single paragraph with hardBreaks (regression: previously deleted whole prompt)", () => {
		const doc = buildDoc(
			p(t("line one"), br(), t("line two"), br(), t("line three")),
		);
		const state = stateAt(doc, 29); // end of "line three"

		const next = applyCmdBackspace(state);

		// Before the fix, the browser's deleteHardLineBackward would erase
		// the entire paragraph contents. The command must instead delete
		// only "line three".
		expect(next.doc.firstChild?.textContent).toBe("line oneline two");
		// HardBreak before the (now empty) trailing line is preserved.
		expect(next.doc.firstChild?.childCount).toBe(4);
		expect(next.doc.firstChild?.lastChild?.type.name).toBe("hardBreak");
	});

	test("deletes the paragraph contents when there is no previous hardBreak", () => {
		const doc = buildDoc(p(t("hello world")));
		const state = stateAt(doc, 12); // end of "hello world" = 1 + 11

		const next = applyCmdBackspace(state);

		expect(next.doc.firstChild?.textContent).toBe("");
	});

	test("returns false when cursor is already at line start", () => {
		const doc = buildDoc(p(t("hello"), br(), t("world")));
		const state = stateAt(doc, 7); // start of "world" = 1 + 5 + 1
		const handled = deleteToLineStart(state, () => {
			throw new Error("dispatch should not be called");
		});
		expect(handled).toBe(false);
	});

	test("returns false when there is a non-empty selection (lets default Backspace handle it)", () => {
		const doc = buildDoc(p(t("hello world")));
		const state = EditorState.create({
			doc,
			selection: TextSelection.create(doc, 1, 6),
		});
		const handled = deleteToLineStart(state, () => {
			throw new Error("dispatch should not be called");
		});
		expect(handled).toBe(false);
	});

	test("only deletes the current line when cursor is mid-line", () => {
		const doc = buildDoc(p(t("line one"), br(), t("line two")));
		// "line two" starts at pos 10; cursor between "line " and "two" is pos 15.
		const state = stateAt(doc, 15);

		const next = applyCmdBackspace(state);

		expect(next.doc.firstChild?.textContent).toBe("line onetwo");
	});
});
