import {
	type UseQueryResult,
	useQueries,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
	getHostServiceClientByUrl,
	type HostWorkspaceRow,
	hostServiceUrl,
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

/** Offline hosts have no entry. */
export type HostWorkspacesStatus = "loading" | "ready" | "error";

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
	/** Rollback hammer: refetch the host's list after a failed write. */
	invalidateHost: (hostId: string) => void;
}

export interface UseHostWorkspacesResult {
	workspaces: HostWorkspaceItem[];
	/**
	 * True once every host answered or failed (or is offline). Gates empty
	 * states only — existing rows always render (cache-first rule).
	 */
	isReady: boolean;
	statusByHost: Readonly<Record<string, HostWorkspacesStatus>>;
	cache: HostWorkspacesCacheOps;
}

interface HostTarget {
	machineId: string;
	/** Null while the host is offline. */
	hostUrl: string | null;
}

/**
 * Workspaces served by each host's `workspace.list` over the relay. The
 * 30s poll plus focus/pull refetch is the healing path; an offline host
 * serves nothing and the UI shows a placeholder.
 */
export function useHostsWorkspaces(
	hosts: WorkspacesHost[],
): UseHostWorkspacesResult {
	const queryClient = useQueryClient();

	// Callers rebuild host objects each render; key on the fields instead.
	const targetsKey = hosts
		.map((host) => `${host.organizationId}/${host.machineId}/${host.isOnline}`)
		.join("|");
	// biome-ignore lint/correctness/useExhaustiveDependencies: targetsKey covers hosts
	const targets = useMemo<HostTarget[]>(
		() =>
			hosts.map((host) => ({
				machineId: host.machineId,
				hostUrl: host.isOnline
					? hostServiceUrl(host.organizationId, host.machineId)
					: null,
			})),
		[targetsKey],
	);

	const combine = useCallback(
		(results: UseQueryResult<HostWorkspaceRow[]>[]) => {
			const workspaces: HostWorkspaceItem[] = [];
			// Plain objects, not Maps: TanStack shares an unchanged combined
			// result deeply, which keeps rows stable across polls.
			const statusByHost: Record<string, HostWorkspacesStatus> = {};
			let isReady = true;
			targets.forEach(({ machineId, hostUrl }, index) => {
				const query = results[index];
				if (!query) return;
				for (const row of query.data ?? []) {
					workspaces.push({ ...row, hostReachable: !query.isError });
				}
				if (hostUrl === null) return;
				const status = query.isSuccess
					? "ready"
					: query.isError
						? "error"
						: "loading";
				statusByHost[machineId] = status;
				if (status === "loading") isReady = false;
			});
			return { workspaces, isReady, statusByHost };
		},
		[targets],
	);

	const { workspaces, isReady, statusByHost } = useQueries({
		queries: targets.map(({ machineId, hostUrl }) => ({
			queryKey: getHostWorkspacesQueryKey(machineId, hostUrl),
			enabled: hostUrl !== null,
			refetchInterval: WORKSPACES_REFETCH_INTERVAL_MS,
			retry: 1,
			networkMode: "always" as const,
			queryFn: async (): Promise<HostWorkspaceRow[]> => {
				if (!hostUrl) return [];
				return getHostServiceClientByUrl(hostUrl).workspace.list.query();
			},
		})),
		combine,
	});

	const cache = useMemo<HostWorkspacesCacheOps>(() => {
		const urlByHost = new Map(
			targets.map(({ machineId, hostUrl }) => [machineId, hostUrl]),
		);
		return {
			resolveHostUrl: (hostId) => urlByHost.get(hostId) ?? null,
			upsertWorkspace: (row) => {
				if (!urlByHost.has(row.hostId)) return;
				queryClient.setQueryData<HostWorkspaceRow[] | undefined>(
					getHostWorkspacesQueryKey(
						row.hostId,
						urlByHost.get(row.hostId) ?? null,
					),
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
				if (!urlByHost.has(hostId)) return;
				void queryClient.invalidateQueries({
					queryKey: getHostWorkspacesQueryKey(
						hostId,
						urlByHost.get(hostId) ?? null,
					),
				});
			},
		};
	}, [targets, queryClient]);

	return { workspaces, isReady, statusByHost, cache };
}
