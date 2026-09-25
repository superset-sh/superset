import { type RefObject, useEffect } from "react";
import type { ViewProps } from "../../../../types";
import type { CodeEditorAdapter } from "../../components/CodeEditor/CodeEditorAdapter";

interface PendingFilePositionOptions {
	editorRef: RefObject<Pick<CodeEditorAdapter, "revealPosition"> | null>;
	isReady: boolean;
	isActive: boolean;
	pendingPosition: ViewProps["pendingPosition"];
	onPositionRevealed: ViewProps["onPositionRevealed"];
}

export function usePendingFilePosition({
	editorRef,
	isReady,
	isActive,
	pendingPosition,
	onPositionRevealed,
}: PendingFilePositionOptions) {
	useEffect(() => {
		if (!isReady || !isActive || !pendingPosition || !editorRef.current) return;
		editorRef.current.revealPosition(
			pendingPosition.line,
			pendingPosition.column,
		);
		onPositionRevealed?.();
	}, [editorRef, isReady, isActive, pendingPosition, onPositionRevealed]);
}
