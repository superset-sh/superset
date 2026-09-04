import { useQueryClient } from "@tanstack/react-query";
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
import { getSandboxAccess } from "@/lib/sandbox-access";

export type CloudWorkspaceStatus = CloudWorkspaceRow["status"];

export interface CloudWorkspaceItem extends HostWorkspaceItem {
	cloud: { status: CloudWorkspaceStatus };
}

/**
 * A cloud row as a list item, without asking its sandbox (a request per
 * sandbox kept every one of them awake while Home was on screen); the served
 * row is read only by the workspace screen (useWorkspaceHost).
 *
 * Two fields are invented: `worktreeExists: true` keeps the list from
 * filtering the row as a stale shell, and `worktreePath: ""` satisfies the
 * shape — nothing reads a path off a list row. `type` is not invented: the
 * sandbox self-seeds its workspace as `main`. `hostReachable` is false so
 * decoration that needs the host (diff stats) waits for the workspace to open.
 */
function itemFromCloudRow(cloud: CloudWorkspaceRow): CloudWorkspaceItem {
	return {
		id: cloud.id,
		organizationId: cloud.organizationId,
		// Cloud workspaces have no project; the row shape still wants one.
		projectId: "",
		hostId: cloud.id,
		name: cloud.name,
		branch: cloud.branch,
		type: "main",
		createdByUserId: cloud.createdByUserId ?? null,
		taskId: null,
		tags: [],
		createdAt: cloud.createdAt,
		updatedAt: cloud.updatedAt,
		// Agent activity is stamped by the sandbox host; unknown until opened.
		lastActivityAt: null,
		worktreePath: "",
		worktreeExists: true,
		projectName: null,
		archivedAt: null,
		archiveReason: null,
		hostReachable: false,
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

/** Cloud workspaces as home-list rows. Addresses are brokered via the API, never the sandbox. */
export function useCloudWorkspaceItems(): CloudWorkspaceItemsValue {
	const queryClient = useQueryClient();
	const { workspaces: cloudRows, isReady: listReady } = useCloudWorkspaces();
	const { targets, isReady: accessReady } = useSandboxAccess(cloudRows);

	const items = useMemo<CloudWorkspaceItem[]>(
		() => cloudRows.map((cloud) => itemFromCloudRow(cloud)),
		[cloudRows],
	);

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
			invalidateHost: (hostId) => {
				const key = keyFor(hostId);
				if (key) void queryClient.invalidateQueries({ queryKey: key });
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
