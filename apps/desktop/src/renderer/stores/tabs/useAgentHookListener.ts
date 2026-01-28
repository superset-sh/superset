import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
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
 * - Stop → "review" (green static) if pane's tab not active, "idle" if tab is active
 * - PermissionRequest → "permission" (red pulsing indicator)
 * - Terminal Exit → "idle" (handled in Terminal.tsx when mounted; also forwarded via notifications for unmounted panes)
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

	// Ref avoids stale closure; parsed from URL since hook runs in _authenticated/layout
	const currentWorkspaceIdRef = useRef<string | null>(null);
	try {
		const match = window.location.pathname.match(/\/workspace\/([^/]+)/);
		currentWorkspaceIdRef.current = match ? match[1] : null;
	} catch {
		currentWorkspaceIdRef.current = null;
	}

	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (!event.data) return;

			const state = useTabsStore.getState();
			const target = resolveNotificationTarget(event.data, state);
			if (!target) return;

			const { paneId, workspaceId } = target;

			if (event.type === NOTIFICATION_EVENTS.AGENT_LIFECYCLE) {
				if (!paneId) return;

				const lifecycleEvent = event.data;
				if (!lifecycleEvent) return;

				const { eventType } = lifecycleEvent;

				if (eventType === "Start") {
					state.setPaneStatus(paneId, "working");
				} else if (eventType === "PermissionRequest") {
					state.setPaneStatus(paneId, "permission");
				} else if (eventType === "Stop") {
					const activeTabId = state.activeTabIds[workspaceId];
					const pane = state.panes[paneId];
					const isInActiveTab =
						currentWorkspaceIdRef.current === workspaceId &&
						pane?.tabId === activeTabId;

					debugLog("agent-hooks", "Stop event:", {
						isInActiveTab,
						activeTabId,
						paneTabId: pane?.tabId,
						paneId,
						willSetTo: isInActiveTab ? "idle" : "review",
					});

					state.setPaneStatus(paneId, isInActiveTab ? "idle" : "review");
				}
			} else if (event.type === NOTIFICATION_EVENTS.TERMINAL_EXIT) {
				// Clear transient status for unmounted panes (mounted panes handle this via stream subscription)
				if (!paneId) return;
				const currentPane = state.panes[paneId];
				if (
					currentPane?.status === "working" ||
					currentPane?.status === "permission"
				) {
					state.setPaneStatus(paneId, "idle");
				}
			} else if (event.type === NOTIFICATION_EVENTS.FOCUS_TAB) {
				navigateToWorkspace(workspaceId, navigate);

				// Re-fetch state after navigation since router nav is async but state updates are immediate
				const freshState = useTabsStore.getState();
				const freshTarget = resolveNotificationTarget(event.data, freshState);

				const tabIdToActivate = freshTarget?.tabId ?? event.data?.tabId;
				if (!tabIdToActivate) return;

				const freshTab = freshState.tabs.find((t) => t.id === tabIdToActivate);
				if (!freshTab || freshTab.workspaceId !== workspaceId) return;

				freshState.setActiveTab(workspaceId, tabIdToActivate);

				const paneIdToFocus = freshTarget?.paneId ?? event.data?.paneId;
				if (paneIdToFocus && freshState.panes[paneIdToFocus]) {
					freshState.setFocusedPane(tabIdToActivate, paneIdToFocus);
				}
			}
		},
	});
}
