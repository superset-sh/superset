import { trpc } from "renderer/lib/trpc";
import { useSetActiveWorkspace } from "renderer/react-query/workspaces/useSetActiveWorkspace";
import { useAppStore } from "../app-state";
import { useTabsStore } from "./store";
import { resolveNotificationTarget } from "./utils/resolve-notification-target";

/**
 * Hook that listens for notification events via tRPC subscription.
 * Handles agent completions and focus requests from native notifications.
 */
export function useAgentHookListener() {
	const setActiveWorkspace = useSetActiveWorkspace();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();

	trpc.notifications.subscribe.useSubscription(undefined, {
		onData: (event) => {
			console.log("event", event);
			if (!event.data) return;

			const state = useTabsStore.getState();
			const target = resolveNotificationTarget(event.data, state);
			if (!target) return;

			const { paneId, workspaceId } = target;

			if (event.type === "agent-complete") {
				if (!paneId) return;

				// Only show red dot if not already viewing this pane
				const activeTabId = state.activeTabIds[workspaceId];
				const focusedPaneId = activeTabId && state.focusedPaneIds[activeTabId];
				const isAlreadyActive =
					activeWorkspace?.id === workspaceId && focusedPaneId === paneId;

				if (!isAlreadyActive) {
					state.setNeedsAttention(paneId, true);
				}
			} else if (event.type === "focus-tab") {
				// Switch to workspace view if not already there
				const appState = useAppStore.getState();
				if (appState.currentView !== "workspace") {
					appState.setView("workspace");
				}

				setActiveWorkspace.mutate(
					{ id: workspaceId },
					{
						onSuccess: () => {
							const freshState = useTabsStore.getState();
							const freshTarget = resolveNotificationTarget(
								event.data,
								freshState,
							);
							if (!freshTarget?.tabId) return;

							const freshTab = freshState.tabs.find(
								(t) => t.id === freshTarget.tabId,
							);
							if (!freshTab || freshTab.workspaceId !== workspaceId) return;

							freshState.setActiveTab(workspaceId, freshTarget.tabId);

							if (freshTarget.paneId && freshState.panes[freshTarget.paneId]) {
								freshState.setFocusedPane(
									freshTarget.tabId,
									freshTarget.paneId,
								);
							}
						},
					},
				);
			}
		},
	});
}
