import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	type CloudWorkspaceRow,
	useCloudWorkspaces,
} from "@/hooks/useCloudWorkspaces";
import {
	getHostWorkspacesQueryKey,
	type HostWorkspaceItem,
	type HostWorkspaceRow,
	type HostWorkspacesCacheOps,
} from "@/hooks/useHostWorkspaces";
import { type SandboxTarget, useSandboxAccess } from "@/hooks/useSandboxAccess";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { getSandboxAccess } from "@/lib/sandbox-access";

const SERVED_REFETCH_INTERVAL_MS = 30_000;

export type CloudWorkspaceStatus = CloudWorkspaceRow["status"];

export interface CloudWorkspaceItem extends HostWorkspaceItem {
	cloud: { status: CloudWorkspaceStatus };
}

/**
 * The row a sandbox serves for its own workspace, restated under the cloud
 * workspace's id: the sandbox reports the machine id of the container it
 * happens to run in, which addresses nothing from here.
 */
export function sandboxWorkspacesQuery(target: SandboxTarget) {
	return {
		queryKey: getHostWorkspacesQueryKey(target.workspaceId, target.url),
		refetchInterval: SERVED_REFETCH_INTERVAL_MS,
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

/**
 * A cloud row rendered as a list item before its sandbox serves anything —
 * while it provisions, after it failed, or in the beat between `ready` and
 * host-service answering. The cloud row is the workspace's identity (it is
 * what created, named and lists it); the sandbox's own row only adds live git
 * state once it exists.
 *
 * Two fields are invented while the sandbox isn't serving, and both are load
 * bearing only in what they prevent: `worktreeExists: true` keeps the list
 * from filtering the row as a stale shell, and `worktreePath: ""` satisfies
 * the shape — nothing reads a path off a list row (the workspace screen's
 * attachment target uses the served row, which has the real one). `type` is
 * not invented: the sandbox self-seeds its workspace as `main`. Anything new
 * that reads more than that off a home-list row has to decide what an
 * unserved sandbox should answer.
 */
function itemFromCloudRow(
	cloud: CloudWorkspaceRow,
	served: HostWorkspaceRow | undefined,
	hostReachable: boolean,
): CloudWorkspaceItem {
	return {
		id: cloud.id,
		organizationId: cloud.organizationId,
		projectId: cloud.projectId,
		hostId: cloud.id,
		name: cloud.name,
		branch: served?.branch ?? cloud.branch,
		type: "main",
		createdByUserId: cloud.createdByUserId ?? null,
		taskId: null,
		createdAt: cloud.createdAt,
		updatedAt: served?.updatedAt ?? cloud.updatedAt,
		worktreePath: served?.worktreePath ?? "",
		worktreeExists: served ? served.worktreeExists : true,
		projectName: served?.projectName ?? null,
		archivedAt: null,
		archiveReason: null,
		hostReachable,
		cloud: { status: cloud.status },
	};
}

export interface CloudWorkspaceItemsValue {
	items: CloudWorkspaceItem[];
	targets: SandboxTarget[];
	cache: HostWorkspacesCacheOps;
	/** True once the cloud list answered and every ready sandbox was addressed. */
	isReady: boolean;
}

/**
 * Cloud workspaces as home-list rows: the cloud list for identity and status,
 * plus each ready sandbox's own `workspace.list` for live branch and worktree
 * state. Query keys match `useHostWorkspaces`, so opening a row resolves
 * straight from cache.
 */
export function useCloudWorkspaceItems(): CloudWorkspaceItemsValue {
	const queryClient = useQueryClient();
	const { workspaces: cloudRows, isReady: listReady } = useCloudWorkspaces();
	const { targets, isReady: accessReady } = useSandboxAccess(cloudRows);

	const served = useQueries({
		queries: targets.map((target) => sandboxWorkspacesQuery(target)),
	});

	const items = useMemo<CloudWorkspaceItem[]>(() => {
		const servedById = new Map<
			string,
			{ row: HostWorkspaceRow | undefined; reachable: boolean }
		>();
		targets.forEach((target, index) => {
			const query = served[index];
			servedById.set(target.workspaceId, {
				row: query?.data?.find((row) => row.id === target.workspaceId),
				reachable: Boolean(query?.data) && !query?.isError,
			});
		});
		return cloudRows.map((cloud) => {
			const entry = servedById.get(cloud.id);
			return itemFromCloudRow(cloud, entry?.row, entry?.reachable ?? false);
		});
	}, [cloudRows, targets, served]);

	const cache = useMemo<HostWorkspacesCacheOps>(() => {
		const keyFor = (hostId: string) => {
			const access = getSandboxAccess(hostId);
			return access ? getHostWorkspacesQueryKey(hostId, access.url) : null;
		};
		return {
			resolveHostUrl: (hostId) => getSandboxAccess(hostId)?.url ?? null,
			upsertWorkspace: (row) => {
				const key = keyFor(row.hostId);
				if (!key) return;
				queryClient.setQueryData<HostWorkspaceRow[] | undefined>(
					key,
					(rows) => {
						if (!rows) return [row];
						const exists = rows.some((existing) => existing.id === row.id);
						return exists
							? rows.map((existing) =>
									existing.id === row.id ? { ...existing, ...row } : existing,
								)
							: [...rows, row];
					},
				);
			},
			removeWorkspace: (hostId, workspaceId) => {
				const key = keyFor(hostId);
				if (!key) return;
				queryClient.setQueryData<HostWorkspaceRow[] | undefined>(key, (rows) =>
					rows?.filter((row) => row.id !== workspaceId),
				);
			},
			invalidateHost: (hostId) => {
				const key = keyFor(hostId);
				if (key) void queryClient.invalidateQueries({ queryKey: key });
			},
			refetchHost: async (hostId) => {
				const key = keyFor(hostId);
				if (!key) return undefined;
				await queryClient.refetchQueries({ queryKey: key });
				return queryClient.getQueryData<HostWorkspaceRow[]>(key);
			},
		};
	}, [queryClient]);

	return {
		items,
		targets,
		cache,
		isReady: listReady && accessReady,
	};
}
