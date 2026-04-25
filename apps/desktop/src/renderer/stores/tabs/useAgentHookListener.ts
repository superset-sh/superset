import { useNavigate } from "@tanstack/react-router";
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

/**
 * Returns the current workspace ID from the live URL hash.
 * The app uses hash routing: file:///.../index.html#/workspace/<id>
 * We must read window.location.hash (not pathname) at event time since the
 * _authenticated layout does not re-render on workspace navigation.
 */
function getCurrentWorkspaceId(): string | null {
	try {
		const match = window.location.hash.match(/\/workspace\/([^/?#]+)/);
		return match ? match[1] : null;
	} catch {
		return null;
	}
}

export function useAgentHookListener() {
	const navigate = useNavigate();

	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (!event.data) return;
			if (event.type === NOTIFICATION_EVENTS.FOCUS_V2_NOTIFICATION_SOURCE) {
				return;
			}

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
				} else if (
					eventType === "PermissionRequest" ||
					eventType === "PendingQuestion"
				) {
					state.setPaneStatus(paneId, "permission");
				} else if (eventType === "Stop") {
					const activeTabId = state.activeTabIds[workspaceId];
					const pane = state.panes[paneId];
					const tabId = pane?.tabId;
					// Tab must be active for this workspace
					const isTabActive = tabId != null && tabId === activeTabId;
					// User is on this workspace if the URL hash matches OR if they have this
					// pane focused (more reliable than URL parsing which can lag behind navigation)
					const isPaneFocused =
						tabId != null && state.focusedPaneIds[tabId] === paneId;
					const isInActiveTab =
						isTabActive &&
						(getCurrentWorkspaceId() === workspaceId || isPaneFocused);

					// If stopping from a pending question state, always go idle (user already engaged)
					const nextStatus =
						pane?.status === "permission"
							? "idle"
							: isInActiveTab
								? "idle"
								: "review";

					debugLog("agent-hooks", "Stop event:", {
						isInActiveTab,
						activeTabId,
						paneTabId: pane?.tabId,
						paneId,
						paneStatus: pane?.status,
						willSetTo: nextStatus,
					});

					state.setPaneStatus(paneId, nextStatus);
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
				navigateToWorkspace(workspaceId, navigate, {
					search: {
						tabId: target.tabId,
						paneId: target.paneId,
					},
				});
			}
		},
	});
}
