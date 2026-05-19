import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { type CodeMirror, getCM, Vim, vim } from "@replit/codemirror-vim";

const saveHandlers = new WeakMap<EditorView, () => void>();
let activeEditorView: EditorView | null = null;
let configured = false;

function invokeSave(cm: CodeMirror | null | undefined) {
	const view = cm?.cm6 ?? activeEditorView;
	if (!view) return;
	saveHandlers.get(view)?.();
}

export function configureCodeMirrorVim() {
	if (configured) return;
	configured = true;

	for (const lhs of ["jk", "kj"]) {
		Vim.unmap(lhs, "insert");
		Vim.map(lhs, "<Esc>", "insert");
	}

	Vim.defineEx("write", "w", (cm) => {
		invokeSave(cm);
	});
}

export function codeMirrorVimExtension(enabled: boolean): Extension {
	configureCodeMirrorVim();
	return enabled ? vim({ status: true }) : [];
}

export function registerCodeMirrorVimEditor(
	view: EditorView,
	options: { onSave?: () => void },
) {
	configureCodeMirrorVim();

	if (options.onSave) {
		saveHandlers.set(view, options.onSave);
	}

	const handleFocus = () => {
		activeEditorView = view;
	};

	view.dom.addEventListener("focusin", handleFocus);

	return () => {
		view.dom.removeEventListener("focusin", handleFocus);
		saveHandlers.delete(view);
		if (activeEditorView === view) {
			activeEditorView = null;
		}
	};
}

export function isCodeMirrorVimInsertMode(view: EditorView | null): boolean {
	if (!view) return false;
	const cm = getCM(view);
	return cm?.state.vim?.insertMode === true;
}

export function isActiveCodeMirrorVimInsertMode(
	target: EventTarget | null,
): boolean {
	if (!activeEditorView) return false;

	const focusedNode =
		typeof Node !== "undefined" && target instanceof Node
			? target
			: document.activeElement;

	if (focusedNode && !activeEditorView.dom.contains(focusedNode)) {
		return false;
	}

	return isCodeMirrorVimInsertMode(activeEditorView);
}
