import { useRef } from "react";
import { trpc } from "renderer/lib/trpc";
import { useSetActiveWorkspace } from "renderer/react-query/workspaces/useSetActiveWorkspace";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { useAppStore } from "../app-state";
import { useTabsStore } from "./store";
import { resolveNotificationTarget } from "./utils/resolve-notification-target";

/**
 * Hook that listens for notification events via tRPC subscription.
 * Handles agent completions, focus requests, and plan submissions.
 */
export function useAgentHookListener() {
	const setActiveWorkspace = useSetActiveWorkspace();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();

	// Use ref to avoid stale closure in subscription callback
	const activeWorkspaceRef = useRef(activeWorkspace);
	activeWorkspaceRef.current = activeWorkspace;

	trpc.notifications.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (!event.data) return;

			const state = useTabsStore.getState();

			// Handle plan submission events
			if (event.type === NOTIFICATION_EVENTS.PLAN_SUBMITTED) {
				const {
					content,
					planId,
					originPaneId,
					summary,
					agentType,
					workspaceId,
				} = event.data;

				// Find the workspace to add the plan pane to
				// First try from the event data, then fall back to active workspace
				const targetWorkspaceId = workspaceId || activeWorkspaceRef.current?.id;

				if (!targetWorkspaceId) {
					console.warn("[useAgentHookListener] No workspace found for plan");
					return;
				}

				state.addPlanViewerPane(targetWorkspaceId, {
					content,
					planId,
					originPaneId,
					summary,
					agentType,
				});
				return;
			}

			const target = resolveNotificationTarget(event.data, state);
			if (!target) return;

			const { paneId, workspaceId } = target;

			if (event.type === NOTIFICATION_EVENTS.AGENT_COMPLETE) {
				if (!paneId) return;

				const activeTabId = state.activeTabIds[workspaceId];
				const focusedPaneId = activeTabId && state.focusedPaneIds[activeTabId];
				const isAlreadyActive =
					activeWorkspaceRef.current?.id === workspaceId &&
					focusedPaneId === paneId;

				if (!isAlreadyActive) {
					state.setNeedsAttention(paneId, true);
				}
			} else if (event.type === NOTIFICATION_EVENTS.FOCUS_TAB) {
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
