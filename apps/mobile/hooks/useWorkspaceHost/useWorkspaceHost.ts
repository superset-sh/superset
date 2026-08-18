import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { useHostsPresence } from "@/hooks/useHostsPresence";
import {
	getHostWorkspacesQueryKey,
	type HostWorkspaceRow,
} from "@/hooks/useHostWorkspaces";
import { NO_HOSTS, type OrgHost, useOrgHostsQuery } from "@/hooks/useOrgHosts";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";

export interface WorkspaceHostResult {
	workspace: HostWorkspaceRow | null;
	host: OrgHost | null;
	/** True while no host has answered yet. */
	isResolving: boolean;
}

/**
 * Locate a workspace's row (and owning host) by asking each online host.
 * Query keys match useHostWorkspaces, so navigating from the list resolves
 * straight from cache.
 */
export function useWorkspaceHost(
	workspaceId: string | null,
): WorkspaceHostResult {
	const hostsQuery = useOrgHostsQuery();
	const hosts = hostsQuery.data ?? NO_HOSTS;
	const presence = useHostsPresence(hosts);

	const targets = useMemo(
		() =>
			hosts
				.map((host) => ({
					...host,
					isOnline: presence?.get(host.machineId) ?? host.isOnline,
				}))
				.filter((host) => host.isOnline)
				.map((host) => ({
					host,
					hostUrl: buildRelayHostUrl(host.organizationId, host.machineId),
				})),
		[hosts, presence],
	);

	const queries = useQueries({
		queries: targets.map(({ host, hostUrl }) => ({
			queryKey: getHostWorkspacesQueryKey(host.machineId, hostUrl),
			enabled: workspaceId !== null,
			staleTime: 30_000,
			retry: 1,
			networkMode: "always" as const,
			queryFn: async (): Promise<HostWorkspaceRow[]> =>
				getHostServiceClientByUrl(hostUrl).workspace.list.query(),
		})),
	});

	return useMemo(() => {
		let workspace: HostWorkspaceRow | null = null;
		let host: OrgHost | null = null;
		targets.forEach(({ host: target }, index) => {
			if (workspace) return;
			const match = queries[index]?.data?.find((row) => row.id === workspaceId);
			if (match) {
				workspace = match;
				host = target;
			}
		});
		const isResolving =
			!workspace &&
			(hostsQuery.isLoading || queries.some((query) => query.isLoading));
		return { workspace, host, isResolving };
	}, [targets, queries, workspaceId, hostsQuery.isLoading]);
}
