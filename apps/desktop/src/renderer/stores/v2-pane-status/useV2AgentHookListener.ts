import { useNavigate } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { useV2PaneStatusStore } from "./store";

/**
 * Listens for agent lifecycle events and updates v2 pane status indicators.
 *
 * Mirrors the v1 `useAgentHookListener` but dispatches to the v2 pane status
 * store instead of useTabsStore. Both hooks subscribe to the same tRPC
 * subscription — events hit both, each silently ignores the other's panes.
 *
 * STATUS MAPPING:
 * - Start → "working"
 * - Stop → "review" (background workspace) or "idle" (current workspace)
 * - PermissionRequest → "permission"
 * - Terminal Exit → "idle" (clears stuck working/permission)
 */
export function useV2AgentHookListener() {
	const navigate = useNavigate();

	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (!event.data) return;

			const paneId = event.data.paneId;
			if (!paneId) return;

			const store = useV2PaneStatusStore.getState();
			if (!store.isV2Pane(paneId)) return;

			if (event.type === NOTIFICATION_EVENTS.AGENT_LIFECYCLE) {
				const { eventType } = event.data;

				if (eventType === "Start") {
					store.setPaneStatus(paneId, "working");
				} else if (eventType === "PermissionRequest") {
					store.setPaneStatus(paneId, "permission");
				} else if (eventType === "Stop") {
					const currentWorkspaceId = extractWorkspaceIdFromPath();
					const eventWorkspaceId = event.data.workspaceId;
					const isCurrentWorkspace =
						eventWorkspaceId != null &&
						currentWorkspaceId === eventWorkspaceId;
					store.setPaneStatus(paneId, isCurrentWorkspace ? "idle" : "review");
				}
			} else if (event.type === NOTIFICATION_EVENTS.TERMINAL_EXIT) {
				const currentStatus = store.statuses[paneId];
				if (currentStatus === "working" || currentStatus === "permission") {
					store.setPaneStatus(paneId, "idle");
				}
			} else if (event.type === NOTIFICATION_EVENTS.FOCUS_TAB) {
				const workspaceId = event.data.workspaceId;
				if (workspaceId && store.isV2Pane(paneId)) {
					void navigate({
						to: "/v2-workspace/$workspaceId",
						params: { workspaceId },
					});
				}
			}
		},
	});
}

function extractWorkspaceIdFromPath(): string | null {
	try {
		const match = window.location.pathname.match(
			/\/v2-workspace\/([^/]+)/,
		);
		return match ? match[1] : null;
	} catch {
		return null;
	}
}
