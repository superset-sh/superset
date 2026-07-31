import { useCallback } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import type {
	CodeEditorAdapter,
	EditorSelectionLines,
} from "../CodeEditorAdapter";

export function formatPathWithLine(
	filePath: string,
	selection: EditorSelectionLines | null | undefined,
): string {
	if (!selection) return filePath;

	const { startLine, endLine } = selection;
	return startLine === endLine
		? `${filePath}:${startLine}`
		: `${filePath}:${startLine}-${endLine}`;
}

interface UseCopyPathWithLineProps {
	getEditor: () => CodeEditorAdapter | null | undefined;
	filePath: string;
}

/**
 * Copies the file path suffixed with the current selection's line range.
 * Falls back to the bare path when no editor or selection is available.
 */
export function useCopyPathWithLine({
	getEditor,
	filePath,
}: UseCopyPathWithLineProps): () => void {
	const { copyToClipboard } = useCopyToClipboard();

	return useCallback(() => {
		copyToClipboard(
			formatPathWithLine(filePath, getEditor()?.getSelectionLines()),
		);
	}, [filePath, getEditor, copyToClipboard]);
}
