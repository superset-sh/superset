import type { WorkspaceInteractionState } from "@superset/panes";
import { useCallback, useEffect, useRef } from "react";
import { pointerPassthrough } from "renderer/lib/pointer-passthrough";

const SOURCE = "shell-resize";

interface UseShellInteractionPassthroughArgs {
	sidebarOpen: boolean;
}

/**
 * A split or sidebar resize tracks the pointer on the host document; a
 * hoisted webview under the pointer would swallow the moves and stall the
 * drag, so embeds yield to the gesture for its duration.
 */
export function useShellInteractionPassthrough({
	sidebarOpen,
}: UseShellInteractionPassthroughArgs) {
	const workspaceResizeActiveRef = useRef(false);
	const sidebarResizeActiveRef = useRef(false);

	const syncBrowserShellInteractionPassthrough = useCallback(() => {
		pointerPassthrough.set(
			SOURCE,
			workspaceResizeActiveRef.current || sidebarResizeActiveRef.current,
		);
	}, []);

	const onWorkspaceInteractionStateChange = useCallback(
		(state: WorkspaceInteractionState) => {
			workspaceResizeActiveRef.current = state.resizeActive;
			syncBrowserShellInteractionPassthrough();
		},
		[syncBrowserShellInteractionPassthrough],
	);

	const onSidebarResizeDragging = useCallback(
		(isDragging: boolean) => {
			sidebarResizeActiveRef.current = isDragging;
			syncBrowserShellInteractionPassthrough();
		},
		[syncBrowserShellInteractionPassthrough],
	);

	const clearBrowserShellInteractionPassthrough = useCallback(() => {
		workspaceResizeActiveRef.current = false;
		sidebarResizeActiveRef.current = false;
		pointerPassthrough.set(SOURCE, false);
	}, []);

	useEffect(() => {
		window.addEventListener("blur", clearBrowserShellInteractionPassthrough);
		return () => {
			window.removeEventListener(
				"blur",
				clearBrowserShellInteractionPassthrough,
			);
			clearBrowserShellInteractionPassthrough();
		};
	}, [clearBrowserShellInteractionPassthrough]);

	useEffect(() => {
		if (sidebarOpen || !sidebarResizeActiveRef.current) return;
		sidebarResizeActiveRef.current = false;
		syncBrowserShellInteractionPassthrough();
	}, [sidebarOpen, syncBrowserShellInteractionPassthrough]);

	return {
		onSidebarResizeDragging,
		onWorkspaceInteractionStateChange,
	};
}
