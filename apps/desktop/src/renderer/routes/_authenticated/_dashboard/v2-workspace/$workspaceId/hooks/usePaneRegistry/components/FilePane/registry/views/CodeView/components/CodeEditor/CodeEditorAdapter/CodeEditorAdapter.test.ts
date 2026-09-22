import { describe, expect, it, mock } from "bun:test";
import { codeFolding, foldEffect, foldedRanges } from "@codemirror/language";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { createCodeMirrorAdapter } from "./CodeEditorAdapter";

function makeEditor(doc: string) {
	const view = {
		state: EditorState.create({ doc, extensions: [codeFolding()] }),
		focus: mock(() => {}),
		dispatch(spec: TransactionSpec) {
			this.state = this.state.update(spec).state;
		},
	};
	return {
		view,
		adapter: createCodeMirrorAdapter(view as unknown as EditorView),
	};
}

describe("file position reveal", () => {
	it("handles an empty file and positions past its end", () => {
		const { view, adapter } = makeEditor("");
		adapter.revealPosition(900, 900);
		expect(view.state.selection.main.head).toBe(0);
		expect(view.focus).toHaveBeenCalledTimes(1);
	});
	it("clamps the line and column to the current document", () => {
		const { view, adapter } = makeEditor("first\nlast");
		adapter.revealPosition(900, 900);
		expect(view.state.selection.main.head).toBe(view.state.doc.length);
		adapter.revealPosition(0, 0);
		expect(view.state.selection.main.head).toBe(0);
	});
	it("uses one-based columns and defaults to the start of the line", () => {
		const { view, adapter } = makeEditor("first\nsecond");
		adapter.revealPosition(2, 3);
		expect(view.state.selection.main.head).toBe(8);
		adapter.revealPosition(2);
		expect(view.state.selection.main.head).toBe(6);
	});
	it("unfolds the region containing the requested position", () => {
		const { view, adapter } = makeEditor("start\nhidden line\nend");
		view.dispatch({ effects: foldEffect.of({ from: 5, to: 17 }) });
		expect(foldedRanges(view.state).size).toBe(1);
		adapter.revealPosition(2, 4);
		expect(view.state.selection.main.head).toBe(9);
		expect(foldedRanges(view.state).size).toBe(0);
	});
});
