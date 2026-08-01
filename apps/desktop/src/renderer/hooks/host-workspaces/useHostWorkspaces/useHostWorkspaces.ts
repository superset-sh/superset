import { getEventBus } from "@superset/workspace-client";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	applyWorkspaceChangedEvent,
	deriveHostWorkspacesQueryTargets,
	getHostWorkspacesQueryKey,
	type HostWorkspaceItem,
	type HostWorkspaceRow,
	loadHostWorkspacesSnapshot,
	mergeHostWorkspaces,
	saveHostWorkspacesSnapshot,
} from "./useHostWorkspaces.utils";

export type { HostWorkspaceItem } from "./useHostWorkspaces.utils";

const WORKSPACES_FALLBACK_REFETCH_INTERVAL_MS = 30_000;

export interface HostWorkspacesCacheOps {
	/** Resolve the URL to reach the host owning `hostId` (null = unreachable). */
	resolveHostUrl: (hostId: string) => string | null;
	/**
	 * Optimistically upsert a row into a host's cached list. The host's
	 * `workspace:changed` broadcast (or the next refetch) converges the
	 * cache onto the real row.
	 */
	upsertWorkspace: (row: HostWorkspaceRow) => void;
	/** Optimistically drop a row from a host's cached list. */
	removeWorkspace: (hostId: string, workspaceId: string) => void;
	/** Rollback hammer: refetch a host's list after a failed write. */
	invalidateHost: (hostId: string) => void;
}

export interface UseHostWorkspacesResult {
	workspaces: HostWorkspaceItem[];
	/**
	 * True once every host answered, failed, or served a snapshot. Gates
	 * empty states only — existing rows always render (cache-first rule).
	 */
	isReady: boolean;
	cache: HostWorkspacesCacheOps;
}

/**
 * The workspace read path: `workspace.list` per host (local direct, remote
 * via relay), merged, live-updated from each host's `workspace:changed`
 * events, with last-seen lists persisted per host to IndexedDB so remote
 * machines still render offline.
 *
 * Unscoped (`scopedHostId` omitted): fans out to every known host — runs
 * once inside HostWorkspacesProvider; consumers read the shared result via
 * that provider's useHostWorkspaces. Cloud rows from the still-synced
 * Electric collection fill in only for hosts that served nothing (pre-R1
 * builds, no snapshot) — that fallback disappears in R3.
 *
 * Scoped (`scopedHostId` a machine id): a single host, no fan-out and no
 * cloud fallback — an unreachable host shows its snapshot or nothing, never
 * stale cloud rows. Query keys are shared with the provider, so a scoped
 * call where the provider is mounted fetches the host once, not twice.
 * Passing null resolves no target and runs nothing (stays !isReady).
 */
export function useHostWorkspacesSource(
	scopedHostId?: string | null,
): UseHostWorkspacesResult {
	const collections = useCollections();
	const queryClient = useQueryClient();
	const { activeHostUrl, machineId } = useLocalHostService();
	const relayUrl = useRelayUrl();

	const { data: hosts = [] } = useLiveQuery(
		(q) =>
			q.from({ hosts: collections.v2Hosts }).select(({ hosts }) => ({
				organizationId: hosts.organizationId,
				machineId: hosts.machineId,
				isOnline: hosts.isOnline,
			})),
		[collections],
	);

	const { data: cloudRows = [] } = useLiveQuery(
		(q) => q.from({ workspaces: collections.v2Workspaces }),
		[collections],
	);

	const targets = useMemo(() => {
		const all = deriveHostWorkspacesQueryTargets({
			activeHostUrl,
			hosts,
			machineId,
			relayUrl,
		});
		return scopedHostId === undefined
			? all
			: all.filter((target) => target.machineId === scopedHostId);
	}, [activeHostUrl, hosts, machineId, relayUrl, scopedHostId]);

	// Last-seen snapshots hydrate once per (org, host); live data always wins.
	const [snapshots, setSnapshots] = useState<Map<string, HostWorkspaceRow[]>>(
		() => new Map(),
	);
	useEffect(() => {
		let cancelled = false;
		for (const target of targets) {
			if (snapshots.has(target.machineId)) continue;
			void loadHostWorkspacesSnapshot(
				target.organizationId,
				target.machineId,
			).then((rows) => {
				if (cancelled || !rows) return;
				setSnapshots((prev) => {
					if (prev.has(target.machineId)) return prev;
					const next = new Map(prev);
					next.set(target.machineId, rows);
					return next;
				});
			});
		}
		return () => {
			cancelled = true;
		};
	}, [targets, snapshots]);

	const queries = useQueries({
		queries: targets.map((target) => ({
			queryKey: getHostWorkspacesQueryKey(target),
			enabled: target.hostUrl !== null,
			refetchInterval: WORKSPACES_FALLBACK_REFETCH_INTERVAL_MS,
			// The local host is reachable at 127.0.0.1 even with the machine
			// offline — the default "online" networkMode would pause these
			// queries the moment navigator.onLine goes false, defeating
			// offline-first entirely.
			networkMode: "always" as const,
			// The interval is the healing path for missed workspace:changed
			// events; keep it running while the window is backgrounded
			// (automation/CLI creates land without the app focused).
			refetchIntervalInBackground: true,
			// Bounded retries so an online-per-cloud but tunnel-less relay
			// target settles into isError quickly instead of holding isReady.
			retry: 1,
			queryFn: async (): Promise<HostWorkspaceRow[]> => {
				if (!target.hostUrl) return [];
				const client = getHostServiceClientByUrl(target.hostUrl);
				const rows =
					(await client.workspace.list.query()) as HostWorkspaceRow[];
				saveHostWorkspacesSnapshot(
					target.organizationId,
					target.machineId,
					rows,
				);
				return rows;
			},
		})),
	});

	// Live updates: each reachable host's workspace:changed patches its own
	// cached list (and the snapshot) without a refetch.
	useEffect(() => {
		const cleanups: Array<() => void> = [];
		for (const target of targets) {
			if (!target.hostUrl) continue;
			const hostUrl = target.hostUrl;
			const bus = getEventBus(hostUrl, () => getHostServiceWsToken(hostUrl));
			const removeListener = bus.on(
				"workspace:changed",
				"*",
				(workspaceId, event) => {
					queryClient.setQueryData<HostWorkspaceRow[] | undefined>(
						getHostWorkspacesQueryKey(target),
						(rows) => {
							const next = applyWorkspaceChangedEvent(
								rows,
								event,
								{
									organizationId: target.organizationId,
									machineId: target.machineId,
								},
								workspaceId,
							);
							if (next && next !== rows) {
								saveHostWorkspacesSnapshot(
									target.organizationId,
									target.machineId,
									next,
								);
							}
							return next;
						},
					);
				},
			);
			const releaseBus = bus.retain();
			cleanups.push(() => {
				removeListener();
				releaseBus();
			});
		}
		return () => {
			for (const cleanup of cleanups) cleanup();
		};
	}, [targets, queryClient]);

	const workspaces = useMemo(
		() =>
			mergeHostWorkspaces({
				hostResults: targets.map((target, index) => {
					const query = queries[index];
					const live = query?.data;
					return {
						target,
						rows: live ?? snapshots.get(target.machineId),
						reachable: live !== undefined && !query?.isError,
					};
				}),
				cloudRows: scopedHostId === undefined ? cloudRows : [],
			}),
		[targets, queries, snapshots, cloudRows, scopedHostId],
	);

	// Readiness reflects host-query settlement only. The Electric collection
	// is a fallback merge, NOT a gate: an Electric collection can stay
	// !isReady indefinitely on an offline cold start (it serves persisted
	// rows without reaching ready), so gating on cloudReady would hang the
	// empty state forever for a genuinely-empty local host while offline.
	// A scoped host that hasn't resolved to a target yet is still loading.
	const isReady =
		(scopedHostId === undefined || targets.length > 0) &&
		queries.every(
			(query, index) =>
				query.isSuccess ||
				query.isError ||
				targets[index]?.hostUrl === null ||
				snapshots.has(targets[index]?.machineId ?? ""),
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
