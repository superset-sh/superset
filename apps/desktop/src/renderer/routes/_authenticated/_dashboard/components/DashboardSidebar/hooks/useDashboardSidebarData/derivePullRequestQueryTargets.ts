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
	organizationId: string;
	machineId: string;
	hostType: DashboardSidebarWorkspaceHostType;
	/**
	 * Null while the host is unreachable (host-service restarting). The
	 * target must survive so the query stays mounted and keeps rendering
	 * cached chips — same pattern as the workspaces/projects fan-outs.
	 */
	hostUrl: string | null;
	workspaceIds: string[];
}

export function derivePullRequestQueryTargets({
	activeHostUrl,
	hosts,
	machineId,
	relayUrl,
	workspaces,
	fallbackOrganizationId,
	sandboxes = [],
}: {
	activeHostUrl: string | null;
	hosts: PullRequestQueryHostRow[];
	machineId: string | null;
	relayUrl: string;
	workspaces: PullRequestQueryWorkspaceRow[];
	/**
	 * Org for the synthesized local target when the hosts list is empty
	 * (cold start before sync) — without it that target keys the cache
	 * under "" and re-keys once hosts arrive, cold-starting the entry.
	 */
	fallbackOrganizationId?: string | null;
	/** Cloud workspaces whose sandbox currently has a brokered address. */
	sandboxes?: Array<{
		workspaceId: string;
		organizationId: string;
		url: string;
	}>;
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

	const targets: PullRequestQueryTarget[] = hosts.flatMap((host) => {
		const workspaceIds = workspaceIdsByHostId.get(host.machineId);
		if (!workspaceIds || workspaceIds.length === 0) return [];

		const isLocal = host.machineId === machineId;
		if (!isLocal && !host.isOnline) return [];

		const hostUrl = isLocal
			? activeHostUrl
			: `${relayUrl}/hosts/${buildHostRoutingKey(host.organizationId, host.machineId)}`;

		return [
			{
				organizationId: host.organizationId,
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
				organizationId:
					hosts[0]?.organizationId ?? fallbackOrganizationId ?? "",
				machineId,
				hostType: "local-device",
				hostUrl: activeHostUrl,
				workspaceIds: localWorkspaceIds,
			});
		}
	}

	// A sandbox is its own host, addressed by the cloud workspace's id — the
	// rows it serves were restated under that id by the workspace fan-out.
	for (const sandbox of sandboxes) {
		const workspaceIds = workspaceIdsByHostId.get(sandbox.workspaceId);
		if (!workspaceIds || workspaceIds.length === 0) continue;
		targets.push({
			organizationId: sandbox.organizationId,
			machineId: sandbox.workspaceId,
			hostType: "cloud",
			hostUrl: sandbox.url,
			workspaceIds,
		});
	}

	return targets;
}

export const DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX = [
	"dashboard-sidebar",
	"pull-requests",
] as const;

export function getDashboardSidebarPullRequestQueryKey(
	target: PullRequestQueryTarget,
) {
	// Keyed on host identity (org + machine), never routing or membership:
	// workspaceIds in the key made every delete/hide/pin blank and refetch all
	// PR chips, and hostUrl did the same on every host-service port change.
	// The queryFn reads the latest ids/url from the target; the poll interval
	// and hover refresh converge changes.
	return [
		...DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX,
		target.organizationId,
		target.machineId,
	] as const;
}
