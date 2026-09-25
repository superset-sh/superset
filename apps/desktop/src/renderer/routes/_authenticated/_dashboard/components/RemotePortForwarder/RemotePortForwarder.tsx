import { useRouterState } from "@tanstack/react-router";
import { useRemotePortForwarding } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useRemotePortForwarding";

const V2_WORKSPACE_PATH = /^\/v2-workspace\/([^/]+)/;

/**
 * Renders nothing; keeps the main process's port forwards in step with the
 * workspace on screen. Reads the live pathname itself, so only this leaf
 * re-renders on navigation, and forwards stop the moment the user leaves a
 * v2 workspace route.
 */
export function RemotePortForwarder() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const activeWorkspaceId = V2_WORKSPACE_PATH.exec(pathname)?.[1] ?? null;
	useRemotePortForwarding(activeWorkspaceId);
	return null;
}
