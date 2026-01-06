import { useRef } from "react";
import { trpc } from "renderer/lib/trpc";
import { useSetActiveWorkspace } from "renderer/react-query/workspaces/useSetActiveWorkspace";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { debugLog } from "shared/debug";
import { useAppStore } from "../app-state";
import { useTabsStore } from "./store";
import { resolveNotificationTarget } from "./utils/resolve-notification-target";

/**
 * Hook that listens for agent lifecycle events via tRPC subscription and updates
 * pane status indicators accordingly.
 *
 * STATUS MAPPING:
 * - Start → "working" (amber pulsing indicator)
 * - Stop → "review" (green static) if pane not active, "idle" if active
 * - PermissionRequest → "permission" (red pulsing indicator)
 * - Terminal Exit → "idle" (handled in Terminal.tsx, clears stuck indicators)
 *
 * KNOWN LIMITATIONS (External - Claude Code / OpenCode hook systems):
 *
 * 1. User Interrupt (Ctrl+C): Claude Code's Stop hook does NOT fire when the user
 *    interrupts the agent. However, the terminal exit handler in Terminal.tsx
 *    will automatically clear the "working" indicator when the process exits.
 *
 * 2. Permission Denied: No hook fires when the user denies a permission request.
 *    The terminal exit handler will clear the "permission" indicator on process exit.
 *
 * 3. Tool Failures: No hook fires when a tool execution fails. The status
 *    continues until the agent stops or terminal exits.
 *
 * Note: Terminal exit detection (in Terminal.tsx) provides a reliable fallback
 * for clearing stuck indicators when agent hooks fail to fire.
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
			const target = resolveNotificationTarget(event.data, state);
			if (!target) return;

			const { paneId, workspaceId } = target;

			if (event.type === NOTIFICATION_EVENTS.AGENT_LIFECYCLE) {
				debugLog("agent-hooks", "Received:", {
					eventType: event.data?.eventType,
					paneId,
					workspaceId,
					activeWorkspace: activeWorkspaceRef.current?.id,
				});

				if (!paneId) return;

				const lifecycleEvent = event.data;
				if (!lifecycleEvent) return;

				const { eventType } = lifecycleEvent;

				if (eventType === "Start") {
					// Agent started working - always set to working
					state.setPaneStatus(paneId, "working");
				} else if (eventType === "PermissionRequest") {
					// Agent needs permission - always set to permission (overrides working)
					state.setPaneStatus(paneId, "permission");
				} else if (eventType === "Stop") {
					// Agent completed - only mark as review if not currently active
					const activeTabId = state.activeTabIds[workspaceId];
					const focusedPaneId =
						activeTabId && state.focusedPaneIds[activeTabId];
					const isAlreadyActive =
						activeWorkspaceRef.current?.id === workspaceId &&
						focusedPaneId === paneId;

					debugLog("agent-hooks", "Stop event:", {
						isAlreadyActive,
						activeTabId,
						focusedPaneId,
						paneId,
						willSetTo: isAlreadyActive ? "idle" : "review",
					});

					if (isAlreadyActive) {
						// User is watching - go straight to idle
						state.setPaneStatus(paneId, "idle");
					} else {
						// User not watching - mark for review
						state.setPaneStatus(paneId, "review");
					}
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
