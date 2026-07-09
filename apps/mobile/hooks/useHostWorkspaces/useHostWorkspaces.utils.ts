import {
	buildRelayHostUrl,
	type HostWorkspaceRow,
} from "@/lib/host-service/client";

export type { HostWorkspaceRow } from "@/lib/host-service/client";

export interface HostWorkspaceItem extends HostWorkspaceRow {
	/** False when the row is a cached result and the host stopped answering. */
	hostReachable: boolean;
}

export interface HostWorkspacesQueryTarget {
	machineId: string;
	organizationId: string;
	/** Null when the host is known but offline. */
	hostUrl: string | null;
}

export interface HostRowForTargets {
	organizationId: string;
	machineId: string;
	isOnline: boolean;
}

export function getHostWorkspacesQueryKey(
	target: Pick<HostWorkspacesQueryTarget, "machineId" | "hostUrl">,
) {
	return [
		"host-service",
		"workspaces",
		"list",
		target.machineId,
		target.hostUrl,
	] as const;
}

export function deriveHostWorkspacesQueryTargets(
	hosts: HostRowForTargets[],
): HostWorkspacesQueryTarget[] {
	return hosts.map((host) => ({
		machineId: host.machineId,
		organizationId: host.organizationId,
		hostUrl: host.isOnline
			? buildRelayHostUrl(host.organizationId, host.machineId)
			: null,
	}));
}

export function mergeHostWorkspaces(
	hostResults: Array<{
		rows: HostWorkspaceRow[] | undefined;
		reachable: boolean;
	}>,
): HostWorkspaceItem[] {
	const items: HostWorkspaceItem[] = [];
	const seenIds = new Set<string>();

	for (const result of hostResults) {
		if (!result.rows) continue;
		for (const row of result.rows) {
			if (seenIds.has(row.id)) continue;
			seenIds.add(row.id);
			items.push({ ...row, hostReachable: result.reachable });
		}
	}

	return items;
}
