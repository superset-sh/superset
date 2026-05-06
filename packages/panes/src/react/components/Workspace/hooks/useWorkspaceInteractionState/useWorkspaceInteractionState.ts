import { useCallback, useEffect, useRef } from "react";
import type { WorkspaceInteractionState } from "../../../../types";

interface UseWorkspaceInteractionStateOptions {
	onInteractionStateChange?: (state: WorkspaceInteractionState) => void;
}

export function useWorkspaceInteractionState({
	onInteractionStateChange,
}: UseWorkspaceInteractionStateOptions) {
	const splitResizeSourcesRef = useRef<Set<string>>(new Set());
	const resizeActiveRef = useRef(false);
	const onInteractionStateChangeRef = useRef(onInteractionStateChange);
	onInteractionStateChangeRef.current = onInteractionStateChange;

	const emitResizeActive = useCallback((resizeActive: boolean) => {
		if (resizeActiveRef.current === resizeActive) return;
		resizeActiveRef.current = resizeActive;
		onInteractionStateChangeRef.current?.({ resizeActive });
	}, []);

	const clearResizeSources = useCallback(() => {
		splitResizeSourcesRef.current.clear();
		emitResizeActive(false);
	}, [emitResizeActive]);

	const onSplitResizeDragging = useCallback(
		(sourceId: string, isDragging: boolean) => {
			if (isDragging) {
				splitResizeSourcesRef.current.add(sourceId);
			} else {
				splitResizeSourcesRef.current.delete(sourceId);
			}
			emitResizeActive(splitResizeSourcesRef.current.size > 0);
		},
		[emitResizeActive],
	);

	useEffect(() => {
		window.addEventListener("blur", clearResizeSources);
		return () => {
			window.removeEventListener("blur", clearResizeSources);
			clearResizeSources();
		};
	}, [clearResizeSources]);

	return { onSplitResizeDragging };
}
