import {
	EditorSelection,
	type EditorState,
	findClusterBreak,
	type TransactionSpec,
} from "@codemirror/state";

function clusterBoundaryAtOrBefore(text: string, pos: number): number {
	const before = findClusterBreak(text, pos, false);
	return findClusterBreak(text, before, true) === pos ? pos : before;
}

export function replaceEditorDocument(
	state: EditorState,
	value: string,
): TransactionSpec {
	const changes = state.changes({
		from: 0,
		to: state.doc.length,
		insert: value,
	});
	const doc = changes.apply(state.doc);
	const head = Math.min(state.selection.main.head, doc.length);
	const line = doc.lineAt(head);
	return {
		changes,
		selection: EditorSelection.cursor(
			line.from + clusterBoundaryAtOrBefore(line.text, head - line.from),
		),
	};
}
