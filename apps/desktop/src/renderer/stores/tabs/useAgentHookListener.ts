import { trpc } from "renderer/lib/trpc";
import { useSetActiveWorkspace } from "renderer/react-query/workspaces/useSetActiveWorkspace";
import { useWindowsStore } from "./store";

/**
 * Hook that listens for notification events via tRPC subscription.
 * Handles agent completions and focus requests from native notifications.
 */
export function useAgentHookListener() {
	const setActiveWorkspace = useSetActiveWorkspace();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();

	trpc.notifications.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "agent-complete") {
				// paneId is passed as tabId for backwards compatibility
				const { tabId: paneId, workspaceId } = event.data;
				const state = useWindowsStore.getState();

				// Find the window containing this pane
				const pane = state.panes[paneId];
				if (!pane) return;

				// Only show red dot if not already viewing this pane
				const activeWindowId = state.activeWindowIds[workspaceId];
				const focusedPaneId =
					activeWindowId && state.focusedPaneIds[activeWindowId];
				const isAlreadyActive =
					activeWorkspace?.id === workspaceId && focusedPaneId === paneId;

				if (!isAlreadyActive) {
					state.setNeedsAttention(paneId, true);
				}
			} else if (event.type === "focus-tab") {
				// paneId is passed as tabId for backwards compatibility
				const { tabId: paneId, workspaceId } = event.data;
				const state = useWindowsStore.getState();

				// Find the window containing this pane
				const pane = state.panes[paneId];
				if (!pane) return;

				const windowId = pane.windowId;

				// Switch to the workspace first (with proper invalidation), then set active window and focused pane
				setActiveWorkspace.mutate(
					{ id: workspaceId },
					{
						onSuccess: () => {
							const currentState = useWindowsStore.getState();
							currentState.setActiveWindow(workspaceId, windowId);
							currentState.setFocusedPane(windowId, paneId);
						},
					},
				);
			}
		},
	});
}
