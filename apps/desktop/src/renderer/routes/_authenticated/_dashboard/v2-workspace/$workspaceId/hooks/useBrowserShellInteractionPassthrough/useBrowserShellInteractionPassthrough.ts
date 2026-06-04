import type { WorkspaceInteractionState } from "@superset/panes";
import { useCallback, useEffect, useRef } from "react";
import { browserRuntimeRegistry } from "../usePaneRegistry/components/BrowserPane";

interface UseBrowserShellInteractionPassthroughArgs {
	sidebarOpen: boolean;
}

export function useBrowserShellInteractionPassthrough({
	sidebarOpen,
}: UseBrowserShellInteractionPassthroughArgs) {
	const workspaceResizeActiveRef = useRef(false);
	const sidebarResizeActiveRef = useRef(false);

	const syncBrowserShellInteractionPassthrough = useCallback(() => {
		browserRuntimeRegistry.setShellInteractionPassthrough(
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
		browserRuntimeRegistry.setShellInteractionPassthrough(false);
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
