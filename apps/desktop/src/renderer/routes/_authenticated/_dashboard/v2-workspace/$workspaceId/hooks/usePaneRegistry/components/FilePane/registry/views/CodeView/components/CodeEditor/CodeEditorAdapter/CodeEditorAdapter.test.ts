import { describe, expect, it } from "bun:test";
import { EditorState } from "@codemirror/state";
import { captureSelection } from "./CodeEditorAdapter";

const DOC = "line1\nline2\nline3\nline4\nline5";

// Build an EditorState with a selection from `anchor` to `head` (character
// offsets). EditorView cannot instantiate in the Bun mock-DOM env
// (MutationObserver is undefined), but captureSelection reads only the state,
// which is headless-constructible — so the capture invariants are tested
// directly against a real EditorState.
function stateWithSelection(doc: string, anchor: number, head: number) {
	return EditorState.create({ doc }).update({ selection: { anchor, head } })
		.state;
}

describe("captureSelection (Contract 1)", () => {
	it("captures path, 1-based start/end lines, and the exact text for a multi-line selection", () => {
		// "line2\nline3" spans offsets 6..17 → lines 2..3
		const state = stateWithSelection(DOC, 6, 17);

		const captured = captureSelection(state, "src/a.ts");

		expect(captured).toEqual({
			path: "src/a.ts",
			startLine: 2,
			endLine: 3,
			text: "line2\nline3",
		});
	});

	it("captures the exact substring that copy() would copy for a single-line selection", () => {
		const doc = "const x = 1";
		// whole line
		const state = stateWithSelection(doc, 0, doc.length);

		const captured = captureSelection(state, "src/x.ts");

		expect(captured?.text).toBe("const x = 1");
		expect(captured?.startLine).toBe(1);
		expect(captured?.endLine).toBe(1);
	});

	it("returns null for a collapsed cursor (edge case #1: empty selection is inert)", () => {
		const state = stateWithSelection(DOC, 6, 6);

		expect(state.selection.main.empty).toBe(true);
		expect(captureSelection(state, "src/a.ts")).toBeNull();
	});

	it("returns null for a whitespace-only selection (edge case #1)", () => {
		const doc = "  \n  ";
		const state = stateWithSelection(doc, 0, doc.length);

		expect(state.selection.main.empty).toBe(false);
		expect(captureSelection(state, "src/ws.ts")).toBeNull();
	});

	it("guarantees finite >=1 integer lines and non-empty text on a non-null capture", () => {
		const state = stateWithSelection(DOC, 0, 5);

		const captured = captureSelection(state, "src/a.ts");

		expect(captured).not.toBeNull();
		expect(Number.isInteger(captured?.startLine)).toBe(true);
		expect(captured?.startLine).toBeGreaterThanOrEqual(1);
		expect(captured?.endLine).toBeGreaterThanOrEqual(captured?.startLine ?? 0);
		expect((captured?.text.length ?? 0) > 0).toBe(true);
	});
});
