import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useNotificationCenterStore } from "renderer/stores/notification-center";
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
	const shownMainProcessErrorIdsRef = useRef<Set<string>>(new Set());
	const workspaceNameByIdRef = useRef<Map<string, string>>(new Map());
	const pendingWorkspaceNameByIdRef = useRef<Map<string, Promise<string>>>(
		new Map(),
	);

	const resolveWorkspaceName = (workspaceId: string): Promise<string> => {
		const cached = workspaceNameByIdRef.current.get(workspaceId);
		if (cached) return Promise.resolve(cached);

		const pending = pendingWorkspaceNameByIdRef.current.get(workspaceId);
		if (pending) return pending;

		const request = electronTrpcClient.workspaces.get
			.query({ id: workspaceId })
			.then((workspace) => {
				const name = workspace.name?.trim() || "Workspace";
				workspaceNameByIdRef.current.set(workspaceId, name);
				pendingWorkspaceNameByIdRef.current.delete(workspaceId);
				return name;
			})
			.catch((error) => {
				debugLog("agent-hooks", "Failed to resolve workspace name", {
					workspaceId,
					error,
				});
				pendingWorkspaceNameByIdRef.current.delete(workspaceId);
				return "Workspace";
			});

		pendingWorkspaceNameByIdRef.current.set(workspaceId, request);
		return request;
	};

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

			if (event.type === NOTIFICATION_EVENTS.MAIN_PROCESS_ERROR) {
				const errorEvent = event.data;
				if (!errorEvent) return;

				useNotificationCenterStore.getState().addEntry({
					sourceEventId: errorEvent.id,
					kind: "error",
					source: `main:${errorEvent.source}`,
					description: errorEvent.details
						? `${errorEvent.message} ${errorEvent.details}`
						: errorEvent.message,
					timestamp: errorEvent.timestamp,
				});

				if (shownMainProcessErrorIdsRef.current.has(errorEvent.id)) return;

				shownMainProcessErrorIdsRef.current.add(errorEvent.id);
				toast.error(errorEvent.message, {
					description: errorEvent.details,
				});
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
				} else if (eventType === "PermissionRequest") {
					state.setPaneStatus(paneId, "permission");
					const paneName = state.panes[paneId]?.name ?? "Agent session";
					useNotificationCenterStore.getState().addEntry({
						dedupeKey: `agent-pane:${paneId}`,
						kind: "notification",
						source: "agent:permission",
						description: `${paneName} needs your attention.`,
						target,
					});
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
					const dedupeKey = `agent-pane:${paneId}`;
					const cachedWorkspaceName =
						workspaceNameByIdRef.current.get(workspaceId) ?? "Workspace";
					useNotificationCenterStore.getState().addEntry({
						dedupeKey,
						kind: "notification",
						source: "agent:complete",
						description: `${cachedWorkspaceName} complete. ${pane?.name ?? "Agent session"} has finished.`,
						target,
					});

					if (cachedWorkspaceName === "Workspace") {
						void resolveWorkspaceName(workspaceId).then((workspaceName) => {
							useNotificationCenterStore
								.getState()
								.updateLatestByDedupeKey(dedupeKey, {
									description: `${workspaceName} complete. ${pane?.name ?? "Agent session"} has finished.`,
								});
						});
					}
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
				if (event.data.reason === "error") {
					const paneName = currentPane?.name ?? "Terminal";
					const signalText = event.data.signal
						? ` signal ${event.data.signal}`
						: "";
					useNotificationCenterStore.getState().addEntry({
						kind: "error",
						source: "terminal:exit",
						description: `Terminal session error: ${paneName} exited with code ${event.data.exitCode}${signalText}.`,
						target,
					});
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
