import { selectAll } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { EditorSelection, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export interface EditorSelectionLines {
	startLine: number;
	endLine: number;
}

/** A captured, resolved selection ready to anchor an agent prompt. `path` is
 *  supplied by the host (the adapter does not know its own file path); the
 *  adapter fills lines + text from a single view.state read. Named
 *  `CapturedEditorSelection` (not `EditorSelection`) to avoid colliding with
 *  `@codemirror/state`'s exported `EditorSelection`. */
export interface CapturedEditorSelection {
	path: string;
	startLine: number;
	endLine: number;
	text: string;
}

/** Snapshot the current selection from a single EditorState read, or null when
 *  there is nothing sendable. Returns null when the selection is collapsed
 *  (empty cursor) or the sliced text is whitespace-only (edge case #1). This
 *  null is net-new logic — it is NOT inherited from getSelectionLines(), which
 *  always returns a non-null range. Kept as a free function (not a closure over
 *  a view) so the capture invariants are testable against a real EditorState
 *  without an EditorView. */
export function captureSelection(
	state: EditorState,
	path: string,
): CapturedEditorSelection | null {
	const selection = state.selection.main;
	if (selection.empty) return null;
	const text = state.sliceDoc(selection.from, selection.to);
	if (text.trim() === "") return null;
	return {
		path,
		startLine: state.doc.lineAt(selection.from).number,
		endLine: state.doc.lineAt(selection.to).number,
		text,
	};
}

export interface CodeEditorAdapter {
	focus(): void;
	getValue(): string;
	setValue(value: string): void;
	revealPosition(line: number, column?: number): void;
	getSelectionLines(): EditorSelectionLines | null;
	getSelection(path: string): CapturedEditorSelection | null;
	selectAll(): void;
	cut(): void;
	copy(): void;
	paste(): void;
	openFind(): void;
	dispose(): void;
}

export function createCodeMirrorAdapter(view: EditorView): CodeEditorAdapter {
	let disposed = false;

	return {
		focus() {
			view.focus();
		},
		getValue() {
			return view.state.doc.toString();
		},
		setValue(value) {
			view.dispatch({
				changes: {
					from: 0,
					to: view.state.doc.length,
					insert: value,
				},
			});
		},
		revealPosition(line, column = 1) {
			const safeLine = Math.max(1, Math.min(line, view.state.doc.lines));
			const lineInfo = view.state.doc.line(safeLine);
			const offset = Math.min(column - 1, lineInfo.length);
			const anchor = lineInfo.from + Math.max(0, offset);

			view.dispatch({
				selection: EditorSelection.cursor(anchor),
				scrollIntoView: true,
			});
			view.focus();
		},
		getSelectionLines() {
			const selection = view.state.selection.main;
			const startLine = view.state.doc.lineAt(selection.from).number;
			const endLine = view.state.doc.lineAt(selection.to).number;
			return { startLine, endLine };
		},
		getSelection(path) {
			return captureSelection(view.state, path);
		},
		selectAll() {
			selectAll(view);
		},
		cut() {
			if (view.state.readOnly) return;
			const clipboard = navigator.clipboard;
			if (!clipboard) return;

			const selection = view.state.selection.main;
			if (selection.empty) return;

			const text = view.state.sliceDoc(selection.from, selection.to);
			void clipboard
				.writeText(text)
				.then(() => {
					if (disposed) return;
					const currentSelection = view.state.selection.main;
					if (
						currentSelection.from !== selection.from ||
						currentSelection.to !== selection.to
					) {
						return;
					}

					if (view.state.sliceDoc(selection.from, selection.to) !== text) {
						return;
					}

					view.dispatch({
						changes: { from: selection.from, to: selection.to, insert: "" },
					});
				})
				.catch((error) => {
					console.error("[CodeEditor] Failed to cut selection:", error);
				});
		},
		copy() {
			const clipboard = navigator.clipboard;
			if (!clipboard) return;

			const selection = view.state.selection.main;
			if (selection.empty) return;

			void clipboard
				.writeText(view.state.sliceDoc(selection.from, selection.to))
				.catch((error) => {
					console.error("[CodeEditor] Failed to copy selection:", error);
				});
		},
		paste() {
			if (view.state.readOnly) return;
			const clipboard = navigator.clipboard;
			if (!clipboard) return;

			void clipboard
				.readText()
				.then((text) => {
					if (disposed) return;
					const selection = view.state.selection.main;
					view.dispatch({
						changes: {
							from: selection.from,
							to: selection.to,
							insert: text,
						},
						selection: EditorSelection.cursor(selection.from + text.length),
					});
				})
				.catch((error) => {
					console.error("[CodeEditor] Failed to paste from clipboard:", error);
				});
		},
		openFind() {
			openSearchPanel(view);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			view.destroy();
		},
	};
}
