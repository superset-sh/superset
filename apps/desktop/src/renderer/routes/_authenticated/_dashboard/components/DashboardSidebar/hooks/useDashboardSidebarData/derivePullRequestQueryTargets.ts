import { buildHostRoutingKey } from "@superset/shared/host-routing";
import type { DashboardSidebarWorkspaceHostType } from "../../types";

export interface PullRequestQueryHostRow {
	organizationId: string;
	machineId: string;
	isOnline: boolean;
}

export interface PullRequestQueryWorkspaceRow {
	id: string;
	hostId: string;
}

export interface PullRequestQueryTarget {
	machineId: string;
	hostType: DashboardSidebarWorkspaceHostType;
	hostUrl: string;
	workspaceIds: string[];
}

export function derivePullRequestQueryTargets({
	activeHostUrl,
	hosts,
	machineId,
	relayUrl,
	workspaces,
}: {
	activeHostUrl: string | null;
	hosts: PullRequestQueryHostRow[];
	machineId: string | null;
	relayUrl: string;
	workspaces: PullRequestQueryWorkspaceRow[];
}): PullRequestQueryTarget[] {
	const workspaceIdsByHostId = new Map<string, string[]>();
	for (const workspace of workspaces) {
		const existing = workspaceIdsByHostId.get(workspace.hostId);
		if (existing) {
			existing.push(workspace.id);
		} else {
			workspaceIdsByHostId.set(workspace.hostId, [workspace.id]);
		}
	}
	for (const workspaceIds of workspaceIdsByHostId.values()) {
		workspaceIds.sort();
	}

	const targets = hosts.flatMap((host) => {
		const workspaceIds = workspaceIdsByHostId.get(host.machineId);
		if (!workspaceIds || workspaceIds.length === 0) return [];

		const isLocal = host.machineId === machineId;
		if (!isLocal && !host.isOnline) return [];

		const hostUrl = isLocal
			? activeHostUrl
			: `${relayUrl}/hosts/${buildHostRoutingKey(host.organizationId, host.machineId)}`;
		if (!hostUrl) return [];

		return [
			{
				machineId: host.machineId,
				hostType: isLocal
					? ("local-device" as const)
					: ("remote-device" as const),
				hostUrl,
				workspaceIds,
			},
		];
	});

	// If the local v2Hosts row hasn't synced via Electric yet, the loop above
	// won't include it — synthesize a local target from machineId + activeHostUrl
	// when there are local-host workspaces visible.
	if (
		machineId &&
		activeHostUrl &&
		!targets.some((target) => target.machineId === machineId)
	) {
		const localWorkspaceIds = workspaceIdsByHostId.get(machineId);
		if (localWorkspaceIds && localWorkspaceIds.length > 0) {
			targets.push({
				machineId,
				hostType: "local-device",
				hostUrl: activeHostUrl,
				workspaceIds: localWorkspaceIds,
			});
		}
	}

	return targets;
}

export function getDashboardSidebarPullRequestQueryKey(
	target: PullRequestQueryTarget,
) {
	return [
		"dashboard-sidebar",
		"pull-requests",
		target.machineId,
		target.hostUrl,
		target.workspaceIds,
	] as const;
}
