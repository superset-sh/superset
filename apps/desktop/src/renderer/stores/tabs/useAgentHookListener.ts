import { trpc } from "renderer/lib/trpc";
import { useSetActiveWorkspace } from "renderer/react-query/workspaces/useSetActiveWorkspace";
import { useAppStore } from "../app-state";
import { useTabsStore } from "./store";

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
				const { paneId, workspaceId } = event.data;
				if (!paneId || !workspaceId) return;

				const state = useTabsStore.getState();

				// Find the tab containing this pane
				const pane = state.panes[paneId];
				if (!pane) return;

				// Only show red dot if not already viewing this pane
				const activeTabId = state.activeTabIds[workspaceId];
				const focusedPaneId = activeTabId && state.focusedPaneIds[activeTabId];
				const isAlreadyActive =
					activeWorkspace?.id === workspaceId && focusedPaneId === paneId;

				if (!isAlreadyActive) {
					state.setNeedsAttention(paneId, true);
				}
			} else if (event.type === "focus-tab") {
				const { paneId, workspaceId } = event.data;
				if (!paneId || !workspaceId) return;

				// Switch to workspace view if not already there
				const appState = useAppStore.getState();
				if (appState.currentView !== "workspace") {
					appState.setView("workspace");
				}

				// Switch to the workspace first, then look up pane/tab from fresh state
				setActiveWorkspace.mutate(
					{ id: workspaceId },
					{
						onSuccess: () => {
							// Get fresh state after workspace switch
							const currentState = useTabsStore.getState();

							// Look up pane from current state
							const pane = currentState.panes[paneId];
							if (!pane) return;

							const tabId = pane.tabId;

							// Validate tab belongs to the target workspace
							const tab = currentState.tabs.find((t) => t.id === tabId);
							if (!tab || tab.workspaceId !== workspaceId) return;

							// Set active tab and focused pane
							currentState.setActiveTab(workspaceId, tabId);
							currentState.setFocusedPane(tabId, paneId);
						},
					},
				);
			}
		},
	});
}
