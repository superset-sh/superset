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
 * - Stop → "review" (green static) so the user gets a completion badge even on
 *   the active/focused pane. It clears automatically on next tab switch / pane
 *   refocus / next Start (see acknowledgedStatus in shared/tabs-types).
 *   Exception: if pane was "permission", Stop → "idle" (user already engaged).
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
					const pane = state.panes[paneId];

					// Always surface a "review" badge on Stop so the user sees a
					// completion indicator everywhere (sidebar / tab strip / pane).
					// It auto-clears on tab switch, focused-pane change, or next
					// Start event via acknowledgedStatus() in the tabs store.
					// Exception: if pane was in "permission" the user already
					// engaged with the prompt, so resolve to idle instead.
					const nextStatus = pane?.status === "permission" ? "idle" : "review";

					debugLog("agent-hooks", "Stop event:", {
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
