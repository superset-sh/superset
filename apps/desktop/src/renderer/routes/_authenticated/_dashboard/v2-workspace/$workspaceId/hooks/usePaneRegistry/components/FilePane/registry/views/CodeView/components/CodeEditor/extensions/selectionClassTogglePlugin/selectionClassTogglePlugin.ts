import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

// Toggle a class on the editor root when any selection range is non-empty, so
// CSS can suppress the active-line highlight while a selection is drawn.
export const selectionClassTogglePlugin = ViewPlugin.fromClass(
	class {
		constructor(view: EditorView) {
			this.sync(view);
		}
		update(update: ViewUpdate) {
			if (update.selectionSet || update.docChanged) {
				this.sync(update.view);
			}
		}
		sync(view: EditorView) {
			const hasSelection = view.state.selection.ranges.some((r) => !r.empty);
			view.dom.classList.toggle("cm-hasSelection", hasSelection);
		}
	},
);
