import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
	type HostWorkspaceRow,
} from "@/lib/host-service/client";

export type { HostWorkspaceRow } from "@/lib/host-service/client";

export interface HostWorkspaceItem extends HostWorkspaceRow {
	/** False when the rows are cached and the host stopped answering. */
	hostReachable: boolean;
}

export interface WorkspacesHost {
	organizationId: string;
	machineId: string;
	isOnline: boolean;
}

const WORKSPACES_REFETCH_INTERVAL_MS = 30_000;

export function getHostWorkspacesQueryKey(
	machineId: string | null,
	hostUrl: string | null,
) {
	return ["host-service", "workspaces", "list", machineId, hostUrl] as const;
}

export interface HostWorkspacesCacheOps {
	/** Resolve the URL to reach the host owning `hostId` (null = unreachable). */
	resolveHostUrl: (hostId: string) => string | null;
	/** Optimistically upsert a row into the host's cached list. */
	upsertWorkspace: (row: HostWorkspaceRow) => void;
	/** Optimistically drop a row from the host's cached list. */
	removeWorkspace: (hostId: string, workspaceId: string) => void;
	/** Rollback hammer: refetch the host's list after a failed write. */
	invalidateHost: (hostId: string) => void;
}

export interface UseHostWorkspacesResult {
	workspaces: HostWorkspaceItem[];
	/**
	 * True once the host answered or failed (or is offline). Gates empty
	 * states only — existing rows always render (cache-first rule).
	 */
	isReady: boolean;
	cache: HostWorkspacesCacheOps;
}

/**
 * Workspaces served by one host's `workspace.list` over the relay. The
 * 30s poll plus focus/pull refetch is the healing path; an offline host
 * serves nothing and the UI shows a placeholder.
 */
export function useHostWorkspaces(
	host: WorkspacesHost | null,
): UseHostWorkspacesResult {
	const queryClient = useQueryClient();

	const hostUrl = host?.isOnline
		? buildRelayHostUrl(host.organizationId, host.machineId)
		: null;
	const machineId = host?.machineId ?? null;
	const queryKey = getHostWorkspacesQueryKey(machineId, hostUrl);

	const query = useQuery({
		queryKey,
		enabled: hostUrl !== null,
		refetchInterval: WORKSPACES_REFETCH_INTERVAL_MS,
		retry: 1,
		networkMode: "always" as const,
		queryFn: async (): Promise<HostWorkspaceRow[]> => {
			if (!hostUrl) return [];
			return getHostServiceClientByUrl(hostUrl).workspace.list.query();
		},
	});

	const workspaces = useMemo<HostWorkspaceItem[]>(
		() =>
			(query.data ?? []).map((row) => ({
				...row,
				hostReachable: !query.isError,
			})),
		[query.data, query.isError],
	);

	const isReady = hostUrl === null || query.isSuccess || query.isError;

	const cache = useMemo<HostWorkspacesCacheOps>(() => {
		const key = getHostWorkspacesQueryKey(machineId, hostUrl);
		return {
			resolveHostUrl: (hostId) => (hostId === machineId ? hostUrl : null),
			upsertWorkspace: (row) => {
				if (row.hostId !== machineId) return;
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
				if (hostId !== machineId) return;
				queryClient.setQueryData<HostWorkspaceRow[] | undefined>(key, (rows) =>
					rows?.filter((row) => row.id !== workspaceId),
				);
			},
			invalidateHost: (hostId) => {
				if (hostId !== machineId) return;
				void queryClient.invalidateQueries({ queryKey: key });
			},
		};
	}, [machineId, hostUrl, queryClient]);

	return { workspaces, isReady, cache };
}
