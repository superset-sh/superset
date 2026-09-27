import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	type CloudWorkspaceRow,
	useCloudWorkspaces,
} from "@/hooks/useCloudWorkspaces";
import {
	getHostWorkspacesQueryKey,
	type HostWorkspaceRow,
} from "@/hooks/useHostWorkspaces";
import { type OrgHost, useOrgHosts } from "@/hooks/useOrgHosts";
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
	/** Cloud only: the API could not address or wake the sandbox. Attempts continue. */
	sandboxUnreachable: boolean;
	/** Cloud only: addressed, but not yet woken since it was opened. */
	sandboxWaking: boolean;
	retrySandbox: () => void;
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
	const { hosts, query: hostsQuery } = useOrgHosts();

	const { workspaces: cloudRows, isReady: cloudReady } = useCloudWorkspaces();
	const cloud = useMemo(
		() => cloudRows.find((row) => row.id === workspaceId) ?? null,
		[cloudRows, workspaceId],
	);
	const {
		target: sandbox,
		isError: sandboxUnreachable,
		isWaking: sandboxWaking,
		retry: retrySandbox,
	} = useSandboxAccess(cloud);

	const targets = useMemo(
		() =>
			cloud
				? []
				: hosts
						.filter((host) => host.isOnline)
						.map((host) => ({
							host,
							hostUrl: hostServiceUrl(host.organizationId, host.machineId),
						})),
		[cloud, hosts],
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
			const host: OrgHost | null = sandbox
				? {
						organizationId: cloud.organizationId,
						machineId: cloud.id,
						name: "Cloud",
						version: null,
						platform: null,
						installSource: null,
						// A sandbox is reachable or it isn't; there is no offline
						// device behind it to report on.
						isOnline: true,
					}
				: null;
			return {
				workspace,
				host,
				cloud,
				sandboxUnreachable: !host && sandboxUnreachable,
				sandboxWaking,
				retrySandbox: () => {
					retrySandbox();
					void served?.refetch();
				},
				isResolving: !host && cloud.status === "ready",
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
		return {
			workspace,
			host,
			cloud: null,
			sandboxUnreachable: false,
			sandboxWaking: false,
			retrySandbox,
			isResolving,
		};
	}, [
		cloud,
		sandbox,
		sandboxUnreachable,
		sandboxWaking,
		retrySandbox,
		targets,
		queries,
		workspaceId,
		hostsQuery.isLoading,
		cloudReady,
	]);
}
