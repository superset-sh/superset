import type { DashboardSidebarPortGroup } from "../useDashboardSidebarPortsData";

export interface ForwardSyncInput {
	hostUrl: string;
	workspaceId: string;
	ports: number[];
}

/**
 * What the main process should forward right now: the remote ports of the
 * selected workspace, or nothing when the selection is local or empty. Ports
 * are sorted so equal inputs serialize equal and skip a redundant sync.
 */
export function deriveForwardSyncInput({
	activeWorkspaceId,
	groups,
}: {
	activeWorkspaceId: string | null;
	groups: DashboardSidebarPortGroup[];
}): ForwardSyncInput {
	const empty = { hostUrl: "", workspaceId: "", ports: [] };
	if (!activeWorkspaceId) return empty;
	const group = groups.find((g) => g.workspaceId === activeWorkspaceId);
	if (!group || group.hostType !== "remote-device") return empty;
	const remote = group.ports.filter((p) => p.hostType === "remote-device");
	const hostUrl = remote[0]?.hostUrl;
	if (!hostUrl) return empty;
	return {
		hostUrl,
		workspaceId: activeWorkspaceId,
		ports: Array.from(new Set(remote.map((p) => p.port))).sort((a, b) => a - b),
	};
}
