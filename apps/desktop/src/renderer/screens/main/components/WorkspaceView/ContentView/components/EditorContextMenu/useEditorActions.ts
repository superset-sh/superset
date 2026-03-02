import { toast } from "@superset/ui/sonner";
import type * as Monaco from "monaco-editor";
import { useCallback } from "react";
import type { EditorActions } from "./EditorContextMenu";

interface UseEditorActionsProps {
	getEditor: () => Monaco.editor.IStandaloneCodeEditor | null | undefined;
	filePath: string;
	/** If true, includes cut/paste actions (for editable editors) */
	editable?: boolean;
}

/**
 * Hook that creates all editor action handlers for the context menu.
 * Shared between FileEditorContextMenu and DiffViewer.
 *
 * Note: Standalone Monaco editor doesn't include language service features
 * like Go to Definition, References, Rename, etc. Those require language
 * providers to be registered. We only expose actions that are actually available.
 */
export function useEditorActions({
	getEditor,
	filePath,
	editable = true,
}: UseEditorActionsProps): EditorActions {
	const handleCut = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.focus();
		editor.trigger("contextMenu", "editor.action.clipboardCutAction", null);
	}, [getEditor]);

	const handleCopy = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.focus();
		editor.trigger("contextMenu", "editor.action.clipboardCopyAction", null);
	}, [getEditor]);

	const handlePaste = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.focus();
		editor.trigger("contextMenu", "editor.action.clipboardPasteAction", null);
	}, [getEditor]);

	const handleSelectAll = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.focus();
		const model = editor.getModel();
		if (model) {
			const fullRange = model.getFullModelRange();
			editor.setSelection(fullRange);
		}
	}, [getEditor]);

	const handleCopyPath = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(filePath);
		} catch (error) {
			console.error("[handleCopyPath] Failed to copy path to clipboard:", {
				error,
				filePath,
			});
			toast.error("Failed to copy path to clipboard", {
				description: String(error),
			});
		}
	}, [filePath]);

	const handleCopyPathWithLine = useCallback(async () => {
		const editor = getEditor();
		if (!editor) {
			console.error(
				"[handleCopyPathWithLine] Editor is missing, falling back to filePath only",
			);
			try {
				await navigator.clipboard.writeText(filePath);
			} catch (error) {
				console.error(
					"[handleCopyPathWithLine] Failed to copy path to clipboard:",
					{ error, filePath },
				);
				toast.error("Failed to copy path to clipboard", {
					description: String(error),
				});
			}
			return;
		}

		const selection = editor.getSelection();
		if (!selection) {
			console.error(
				"[handleCopyPathWithLine] Selection is missing, falling back to filePath only",
			);
			try {
				await navigator.clipboard.writeText(filePath);
			} catch (error) {
				console.error(
					"[handleCopyPathWithLine] Failed to copy path to clipboard:",
					{ error, filePath },
				);
				toast.error("Failed to copy path to clipboard", {
					description: String(error),
				});
			}
			return;
		}

		const { startLineNumber, endLineNumber } = selection;
		const pathWithLine =
			startLineNumber === endLineNumber
				? `${filePath}:${startLineNumber}`
				: `${filePath}:${startLineNumber}-${endLineNumber}`;

		try {
			await navigator.clipboard.writeText(pathWithLine);
		} catch (error) {
			console.error(
				"[handleCopyPathWithLine] Failed to copy path with line to clipboard:",
				{ error, pathWithLine },
			);
			toast.error("Failed to copy path to clipboard", {
				description: String(error),
			});
		}
	}, [filePath, getEditor]);

	const handleFind = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.focus();
		editor.trigger("contextMenu", "actions.find", null);
	}, [getEditor]);

	const handleChangeAllOccurrences = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.focus();
		// Use selectHighlights which is available in standalone Monaco
		editor.trigger("contextMenu", "editor.action.selectHighlights", null);
	}, [getEditor]);

	return {
		onCut: editable ? handleCut : undefined,
		onCopy: handleCopy,
		onPaste: editable ? handlePaste : undefined,
		onSelectAll: handleSelectAll,
		onCopyPath: handleCopyPath,
		onCopyPathWithLine: handleCopyPathWithLine,
		onFind: handleFind,
		onChangeAllOccurrences: handleChangeAllOccurrences,
	};
}
