import { useLiveQuery } from "@tanstack/react-db";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import {
	deriveHostWorkspacesQueryTargets,
	getHostWorkspacesQueryKey,
	type HostWorkspaceItem,
	type HostWorkspaceRow,
	mergeHostWorkspaces,
} from "./useHostWorkspaces.utils";

export type { HostWorkspaceItem } from "./useHostWorkspaces.utils";

const WORKSPACES_REFETCH_INTERVAL_MS = 30_000;

export interface HostWorkspacesCacheOps {
	/** Resolve the URL to reach the host owning `hostId` (null = unreachable). */
	resolveHostUrl: (hostId: string) => string | null;
	/** Optimistically upsert a row into a host's cached list. */
	upsertWorkspace: (row: HostWorkspaceRow) => void;
	/** Optimistically drop a row from a host's cached list. */
	removeWorkspace: (hostId: string, workspaceId: string) => void;
	/** Rollback hammer: refetch a host's list after a failed write. */
	invalidateHost: (hostId: string) => void;
}

export interface UseHostWorkspacesResult {
	workspaces: HostWorkspaceItem[];
	/**
	 * True once every host answered or failed. Gates empty states only —
	 * existing rows always render (cache-first rule).
	 */
	isReady: boolean;
	cache: HostWorkspacesCacheOps;
}

/**
 * The workspace read path (mobile port of desktop's useHostWorkspaces):
 * fan out `workspace.list` to every online host via the relay and merge.
 * No local host, no event bus — the 30s poll plus focus/pull refetch is
 * the healing path. Offline hosts serve nothing; the UI shows them as a
 * placeholder.
 */
export function useHostWorkspaces(): UseHostWorkspacesResult {
	const collections = useCollections();
	const queryClient = useQueryClient();

	const { data: hosts } = useLiveQuery(
		(q) => q.from({ v2Hosts: collections.v2Hosts }),
		[collections],
	);

	const targets = useMemo(
		() => deriveHostWorkspacesQueryTargets(hosts ?? []),
		[hosts],
	);

	const queries = useQueries({
		queries: targets.map((target) => ({
			queryKey: getHostWorkspacesQueryKey(target),
			enabled: target.hostUrl !== null,
			refetchInterval: WORKSPACES_REFETCH_INTERVAL_MS,
			retry: 1,
			networkMode: "always" as const,
			queryFn: async (): Promise<HostWorkspaceRow[]> => {
				if (!target.hostUrl) return [];
				return getHostServiceClientByUrl(target.hostUrl).workspace.list.query();
			},
		})),
	});

	const workspaces = useMemo(
		() =>
			mergeHostWorkspaces(
				targets.map((_target, index) => {
					const query = queries[index];
					return {
						rows: query?.data,
						reachable: query?.data !== undefined && !query?.isError,
					};
				}),
			),
		[targets, queries],
	);

	const isReady = queries.every(
		(query, index) =>
			query.isSuccess || query.isError || targets[index]?.hostUrl === null,
	);

	const cache = useMemo<HostWorkspacesCacheOps>(() => {
		const targetFor = (hostId: string) =>
			targets.find((target) => target.machineId === hostId);
		return {
			resolveHostUrl: (hostId) => targetFor(hostId)?.hostUrl ?? null,
			upsertWorkspace: (row) => {
				const target = targetFor(row.hostId);
				if (!target) return;
				queryClient.setQueryData<HostWorkspaceRow[] | undefined>(
					getHostWorkspacesQueryKey(target),
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
				const target = targetFor(hostId);
				if (!target) return;
				queryClient.setQueryData<HostWorkspaceRow[] | undefined>(
					getHostWorkspacesQueryKey(target),
					(rows) => rows?.filter((row) => row.id !== workspaceId),
				);
			},
			invalidateHost: (hostId) => {
				const target = targetFor(hostId);
				if (!target) return;
				void queryClient.invalidateQueries({
					queryKey: getHostWorkspacesQueryKey(target),
				});
			},
		};
	}, [targets, queryClient]);

	return { workspaces, isReady, cache };
}
