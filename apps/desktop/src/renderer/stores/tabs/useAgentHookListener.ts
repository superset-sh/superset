import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { trpc } from "renderer/lib/trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { debugLog } from "shared/debug";
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
	const navigate = useNavigate();

	// Track current workspace from router to avoid stale closure
	const currentWorkspaceIdRef = useRef<string | null>(null);

	// We need to update this ref from the workspace page, but for now
	// we'll use router state. This is called from _authenticated/layout
	// so we check the current route
	try {
		const location = window.location;
		const match = location.pathname.match(/\/workspace\/([^/]+)/);
		currentWorkspaceIdRef.current = match ? match[1] : null;
	} catch {
		currentWorkspaceIdRef.current = null;
	}

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
					currentWorkspace: currentWorkspaceIdRef.current,
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
						currentWorkspaceIdRef.current === workspaceId &&
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
				// Navigate to the workspace and focus the tab/pane
				navigateToWorkspace(workspaceId, navigate);

				// Set active tab and focused pane after navigation
				// (router navigation is async, but state updates are immediate)
				const freshState = useTabsStore.getState();
				const freshTarget = resolveNotificationTarget(event.data, freshState);
				if (!freshTarget?.tabId) return;

				const freshTab = freshState.tabs.find(
					(t) => t.id === freshTarget.tabId,
				);
				if (!freshTab || freshTab.workspaceId !== workspaceId) return;

				freshState.setActiveTab(workspaceId, freshTarget.tabId);

				if (freshTarget.paneId && freshState.panes[freshTarget.paneId]) {
					freshState.setFocusedPane(freshTarget.tabId, freshTarget.paneId);
				}
			}
		},
	});
}
