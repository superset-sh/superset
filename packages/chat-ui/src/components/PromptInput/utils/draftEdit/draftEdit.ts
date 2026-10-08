import { $getRoot, type EditorState, type LexicalEditor } from "lexical";

const textOf = (state: EditorState) =>
	state.read(() => $getRoot().getTextContent());

/**
 * Calls `onEdit` once, the first time the text moves off `seededText`.
 * Typing the draft back afterwards does not undo it.
 */
export function registerDraftEdit(
	editor: LexicalEditor,
	seededText: string,
	onEdit: () => void,
): () => void {
	const unregister = editor.registerUpdateListener(
		({ editorState, prevEditorState }) => {
			if (textOf(prevEditorState) !== seededText) return;
			if (textOf(editorState) === seededText) return;
			unregister();
			onEdit();
		},
	);
	return unregister;
}
