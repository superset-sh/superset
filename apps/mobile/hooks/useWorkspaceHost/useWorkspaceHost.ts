import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	type CloudWorkspaceRow,
	useCloudWorkspaces,
} from "@/hooks/useCloudWorkspaces";
import { useHostsPresence } from "@/hooks/useHostsPresence";
import {
	getHostWorkspacesQueryKey,
	type HostWorkspaceRow,
} from "@/hooks/useHostWorkspaces";
import { NO_HOSTS, type OrgHost, useOrgHostsQuery } from "@/hooks/useOrgHosts";
import { type SandboxTarget, useSandboxAccess } from "@/hooks/useSandboxAccess";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";

const SANDBOX_REFETCH_INTERVAL_MS = 30_000;

/**
 * The row a sandbox serves for its own workspace, restated under the cloud
 * workspace's id: the sandbox reports the machine id of the container it
 * happens to run in, which addresses nothing from here.
 */
function sandboxWorkspacesQuery(target: SandboxTarget) {
	return {
		queryKey: getHostWorkspacesQueryKey(target.workspaceId, target.url),
		refetchInterval: SANDBOX_REFETCH_INTERVAL_MS,
		retry: 1,
		networkMode: "always" as const,
		queryFn: async (): Promise<HostWorkspaceRow[]> => {
			const rows = await getHostServiceClientByUrl(
				target.url,
			).workspace.list.query();
			return rows.map((row) => ({ ...row, hostId: target.workspaceId }));
		},
	};
}

export interface WorkspaceHostResult {
	workspace: HostWorkspaceRow | null;
	host: OrgHost | null;
	/**
	 * The cloud row when the id names a cloud workspace — present from the
	 * moment it is created, long before a sandbox serves it. Null otherwise.
	 */
	cloud: CloudWorkspaceRow | null;
	/** True while no host has answered yet. */
	isResolving: boolean;
}

/**
 * Locate a workspace's row (and owning host) by asking each online host.
 * Query keys match useHostWorkspaces, so navigating from the list resolves
 * straight from cache.
 *
 * A cloud workspace has no host row: its sandbox is its own host, keyed by
 * the workspace's id and addressed through a brokered token, so it is looked
 * up in the cloud list first and asked directly.
 */
export function useWorkspaceHost(
	workspaceId: string | null,
): WorkspaceHostResult {
	const hostsQuery = useOrgHostsQuery();
	const hosts = hostsQuery.data ?? NO_HOSTS;
	const presence = useHostsPresence(hosts);

	const { workspaces: cloudRows, isReady: cloudReady } = useCloudWorkspaces();
	const cloud = useMemo(
		() => cloudRows.find((row) => row.id === workspaceId) ?? null,
		[cloudRows, workspaceId],
	);
	const cloudTargets = useMemo(() => (cloud ? [cloud] : []), [cloud]);
	const { targets: sandboxes, isReady: sandboxReady } =
		useSandboxAccess(cloudTargets);
	const sandbox = sandboxes[0] ?? null;

	const targets = useMemo(
		() =>
			cloud
				? []
				: hosts
						.map((host) => ({
							...host,
							isOnline: presence?.get(host.machineId) ?? host.isOnline,
						}))
						.filter((host) => host.isOnline)
						.map((host) => ({
							host,
							hostUrl: hostServiceUrl(host.organizationId, host.machineId),
						})),
		[cloud, hosts, presence],
	);

	const queries = useQueries({
		queries: [
			...(sandbox ? [sandboxWorkspacesQuery(sandbox)] : []),
			...targets.map(({ host, hostUrl }) => ({
				queryKey: getHostWorkspacesQueryKey(host.machineId, hostUrl),
				enabled: workspaceId !== null,
				staleTime: 30_000,
				retry: 1,
				networkMode: "always" as const,
				queryFn: async (): Promise<HostWorkspaceRow[]> =>
					getHostServiceClientByUrl(hostUrl).workspace.list.query(),
			})),
		],
	});

	return useMemo(() => {
		if (cloud) {
			const served = sandbox ? queries[0] : undefined;
			const servedRow =
				served?.data?.find((row) => row.id === workspaceId) ?? null;
			// The cloud row owns the name — it is what created, named and lists
			// the workspace; the sandbox's own row is scratch that a rename
			// never reaches. Live git state still comes from the sandbox.
			const workspace = servedRow ? { ...servedRow, name: cloud.name } : null;
			return {
				workspace,
				host: workspace
					? {
							organizationId: cloud.organizationId,
							machineId: cloud.id,
							name: "Cloud",
							// A sandbox is reachable or it isn't; there is no offline
							// device behind it to report on.
							isOnline: true,
						}
					: null,
				cloud,
				isResolving:
					!workspace &&
					cloud.status === "ready" &&
					(!sandboxReady || served?.isLoading === true),
			};
		}
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
			(hostsQuery.isLoading ||
				!cloudReady ||
				queries.some((query) => query.isLoading));
		return { workspace, host, cloud: null, isResolving };
	}, [
		cloud,
		sandbox,
		sandboxReady,
		targets,
		queries,
		workspaceId,
		hostsQuery.isLoading,
		cloudReady,
	]);
}
