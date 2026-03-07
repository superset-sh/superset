import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
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

		const selection = editor.getSelectionLines();
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

		const { startLine, endLine } = selection;
		const pathWithLine =
			startLine === endLine
				? `${filePath}:${startLine}`
				: `${filePath}:${startLine}-${endLine}`;

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
