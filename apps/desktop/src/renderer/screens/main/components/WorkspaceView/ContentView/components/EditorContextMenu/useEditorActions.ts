import { useCallback } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import type { CodeEditorAdapter } from "../CodeEditorAdapter";
import type { EditorActions } from "./EditorContextMenu";

interface UseEditorActionsProps {
	getEditor: () => CodeEditorAdapter | null | undefined;
	filePath: string;
	/** If true, includes cut/paste actions (for editable editors) */
	editable?: boolean;
}

/**
 * Hook that creates all editor action handlers for the context menu.
 * Shared by editor surfaces that operate through the adapter contract.
 */
export function useEditorActions({
	getEditor,
	filePath,
	editable = true,
}: UseEditorActionsProps): EditorActions {
	const { copyToClipboard } = useCopyToClipboard();

	const handleCut = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.cut();
	}, [getEditor]);

	const handleCopy = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.copy();
	}, [getEditor]);

	const handlePaste = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.paste();
	}, [getEditor]);

	const handleSelectAll = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.selectAll();
	}, [getEditor]);

	const handleCopyPath = useCallback(() => {
		copyToClipboard(filePath);
	}, [filePath, copyToClipboard]);

	const handleCopyPathWithLine = useCallback(() => {
		const editor = getEditor();
		if (!editor) {
			copyToClipboard(filePath);
			return;
		}

		const selection = editor.getSelectionLines();
		if (!selection) {
			copyToClipboard(filePath);
			return;
		}

		const { startLine, endLine } = selection;
		const pathWithLine =
			startLine === endLine
				? `${filePath}:${startLine}`
				: `${filePath}:${startLine}-${endLine}`;

		copyToClipboard(pathWithLine);
	}, [filePath, getEditor, copyToClipboard]);

	const handleFind = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.openFind();
	}, [getEditor]);

	return {
		onCut: editable ? handleCut : undefined,
		onCopy: handleCopy,
		onPaste: editable ? handlePaste : undefined,
		onSelectAll: handleSelectAll,
		onCopyPath: handleCopyPath,
		onCopyPathWithLine: handleCopyPathWithLine,
		onFind: handleFind,
	};
}
