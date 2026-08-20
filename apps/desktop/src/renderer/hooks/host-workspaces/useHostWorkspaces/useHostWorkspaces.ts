import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useSandboxAccess } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import {
	applyWorkspaceChangedEvent,
	deriveHostWorkspacesQueryTargets,
	getHostWorkspacesQueryKey,
	type HostWorkspaceItem,
	type HostWorkspaceRow,
	isEventBusReopen,
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
	 * Whether `hostId` is a cloud sandbox. Callers that hold a socket per host
	 * ask this before subscribing: the provider counts a held connection as
	 * activity, so a background subscription keeps a sandbox's VM awake for as
	 * long as the app is open. Connect to a sandbox only while it is in view.
	 */
	isSandboxHost: (hostId: string) => boolean;
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
	/** True once at least one host resolved to a reachable URL. */
	hasLiveTargets: boolean;
	/**
	 * Force-refetch every reachable host's live list; resolves when all
	 * settle (success or error). The workspace route's miss verdict awaits
	 * this so "not found" is never declared from data older than the request
	 * — the mirror converges through fire-and-forget events plus a slow
	 * fallback refetch, so a just-created row can trail its own deep link.
	 */
	refetchAll: () => Promise<void>;
}

export interface UseHostWorkspacesResult {
	workspaces: HostWorkspaceItem[];
	/**
	 * True once every host answered, failed, or served a snapshot. Gates
	 * empty states only — existing rows always render (cache-first rule).
	 */
	isReady: boolean;
	/**
	 * The org's host list itself is trustworthy (useKnownHosts settled) —
	 * weaker than isReady: it does not wait for any host's list to answer, so
	 * one unreachable host cannot hold it. Until this is true the fan-out may
	 * cover only the local host.
	 */
	hostsSettled: boolean;
	cache: HostWorkspacesCacheOps;
}

/**
 * The workspace read path: `workspace.list` per host (local direct, remote
 * via relay), merged and live-updated from each host's `workspace:changed`
 * events, with last-seen lists persisted per host to IndexedDB so remote
 * machines still render offline. A host that has neither answered nor got a
 * snapshot contributes nothing.
 *
 * Unscoped (`scopedHostId` omitted): fans out to every known host — runs
 * once inside HostWorkspacesProvider; consumers read the shared result via
 * that provider's useHostWorkspaces.
 *
 * Scoped (`scopedHostId` a machine id): a single host, no fan-out. Query
 * keys are shared with the provider, so a scoped call where the provider is
 * mounted fetches the host once, not twice. Passing null resolves no target
 * and runs nothing (stays !isReady).
 *
 * `includeArchived` additionally fetches archived tombstones (soft-deleted
 * workspaces) under a separate query key — the shared live cache never sees
 * archived rows. Tombstones append after live rows with
 * `archivedAt`/`archiveReason` set.
 */
export function useHostWorkspacesSource(
	scopedHostId?: string | null,
	options?: { includeArchived?: boolean },
): UseHostWorkspacesResult {
	const includeArchived = options?.includeArchived ?? false;
	const queryClient = useQueryClient();
	const { activeHostUrl, machineId } = useLocalHostService();
	const relayUrl = useRelayUrl();

	const {
		hosts,
		organizationId: knownHostsOrgId,
		settled: knownHostsSettled,
	} = useKnownHosts();
	const { targets: sandboxes, isReady: sandboxesReady } = useSandboxAccess();

	const targets = useMemo(() => {
		const all = deriveHostWorkspacesQueryTargets({
			activeHostUrl,
			hosts,
			machineId,
			relayUrl,
			fallbackOrganizationId: knownHostsOrgId,
			sandboxes,
		});
		return scopedHostId === undefined
			? all
			: all.filter((target) => target.machineId === scopedHostId);
	}, [
		activeHostUrl,
		hosts,
		knownHostsOrgId,
		machineId,
		relayUrl,
		sandboxes,
		scopedHostId,
	]);

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
				const served =
					(await client.workspace.list.query()) as HostWorkspaceRow[];
				// A sandbox reports the machine id of the container it happens to
				// be running in, which addresses nothing from here. Restate it as
				// the cloud workspace's id so every host-keyed lookup downstream
				// (pull requests, agent status, diff stats) resolves.
				const rows = target.isSandbox
					? served.map((row) => ({ ...row, hostId: target.machineId }))
					: served;
				saveHostWorkspacesSnapshot(
					target.organizationId,
					target.machineId,
					rows,
				);
				return rows;
			},
		})),
	});

	// Archived tombstones, opt-in, own query key: the shared live list (and
	// its persisted snapshots) must never contain archived rows.
	const archivedQueries = useQueries({
		queries: targets.map((target) => ({
			queryKey: [
				"host-service",
				"workspaces",
				"archived",
				target.organizationId,
				target.machineId,
			] as const,
			enabled: includeArchived && target.hostUrl !== null,
			refetchInterval: WORKSPACES_FALLBACK_REFETCH_INTERVAL_MS,
			networkMode: "always" as const,
			queryFn: async (): Promise<HostWorkspaceRow[]> => {
				if (!target.hostUrl) return [];
				const client = getHostServiceClientByUrl(target.hostUrl);
				const rows = (await client.workspace.list.query({
					includeArchived: true,
				})) as HostWorkspaceRow[];
				return rows.filter((row) => row.archivedAt != null);
			},
		})),
	});

	const busEverOpenedRef = useRef<Set<string>>(new Set());

	// Live updates: each reachable host's workspace:changed patches its own
	// cached list without a refetch.
	//
	// Not for sandboxes. The provider counts a held connection as activity, so
	// subscribing here would keep every cloud workspace's VM awake for as long
	// as the app is open — ten in the sidebar, ten warm machines, whether or not
	// anyone is looking at them. And there is nothing to be gained: a sandbox
	// holds exactly one workspace whose identity the cloud row owns; the only
	// field read off its served row is the branch, which has a fallback and can
	// only change while someone is inside it — when the open workspace's own
	// subscribers hold a socket anyway. Sandboxes are polled, and connected to
	// only while open.
	useEffect(() => {
		const cleanups: Array<() => void> = [];
		for (const target of targets) {
			if (!target.hostUrl || target.isSandbox) continue;
			const hostUrl = target.hostUrl;
			const bus = getHostEventBus(hostUrl);
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
					// Archive state flips arrive as deleted/created events; the
					// tombstone list has no patch payload, so refetch it.
					if (includeArchived) {
						void queryClient.invalidateQueries({
							queryKey: [
								"host-service",
								"workspaces",
								"archived",
								target.organizationId,
								target.machineId,
							],
						});
					}
				},
			);
			// Resync on reopen: events broadcast while the socket was down are
			// lost (no replay), so every reopen is a potential gap. Invalidate
			// all of this host's mirrors — workspaces, projects, ports share the
			// "host-service" key prefix + machineId. Flap cost is bounded by the
			// bus's own reconnect backoff (≥1s) and scoped to the one host.
			// Whether this bus ever opened must survive effect re-runs: targets
			// churn on presence flips, which correlate with outages — a re-run
			// mid-outage that re-derived "never opened" from current state would
			// silently skip the gap resync on the next reopen.
			if (bus.getConnectionStatus().state === "open") {
				busEverOpenedRef.current.add(hostUrl);
			}
			const removeStatusListener = bus.subscribeConnectionStatus((status) => {
				const reopened = isEventBusReopen(
					busEverOpenedRef.current.has(hostUrl),
					status.state,
				);
				if (status.state === "open") busEverOpenedRef.current.add(hostUrl);
				if (!reopened) return;
				void queryClient.invalidateQueries({
					predicate: (query) =>
						query.queryKey[0] === "host-service" &&
						query.queryKey.includes(target.machineId),
				});
			});
			const releaseBus = bus.retain();
			cleanups.push(() => {
				removeListener();
				removeStatusListener();
				releaseBus();
			});
		}
		return () => {
			for (const cleanup of cleanups) cleanup();
		};
	}, [targets, queryClient, includeArchived]);

	const workspaces = useMemo(() => {
		const merged = mergeHostWorkspaces({
			hostResults: targets.map((target, index) => {
				const query = queries[index];
				const live = query?.data;
				return {
					target,
					rows: live ?? snapshots.get(target.machineId),
					reachable: live !== undefined && !query?.isError,
				};
			}),
		});
		if (!includeArchived) return merged;
		// Tombstones append after live rows; consumers dedupe by id, so a row
		// mid-unarchive can't render twice.
		const liveIds = new Set(merged.map((row) => row.id));
		const archived: HostWorkspaceItem[] = targets.flatMap((_target, index) => {
			const query = archivedQueries[index];
			const rows = query?.data ?? [];
			return rows
				.filter((row) => !liveIds.has(row.id))
				.map((row) => ({
					...row,
					// react-query retains prior data across a failed refetch —
					// don't report a host as answering when it did not.
					hostReachable: !query?.isError,
				}));
		});
		return [...merged, ...archived];
	}, [targets, queries, includeArchived, archivedQueries, snapshots]);

	// Readiness reflects host-query settlement only. A scoped host that
	// hasn't resolved to a target yet is still loading. Known-hosts
	// settlement IS a gate: targets derive from it, and before it settles
	// the fan-out covers only the local host — every query answering then
	// means "the hosts we know of answered", not "every host answered".
	// Reporting ready off that would flash not-found for remote workspaces
	// right after an org switch (offline stays fine: a prior session's
	// snapshot settles the host without a live answer).
	const isReady =
		knownHostsSettled &&
		// A cloud workspace is only addressable once its sandbox is brokered, so
		// answering ready before that flashes not-found on every cloud open.
		sandboxesReady &&
		(scopedHostId === undefined || targets.length > 0) &&
		queries.every(
			(query, index) =>
				query.isSuccess ||
				query.isError ||
				targets[index]?.hostUrl === null ||
				snapshots.has(targets[index]?.machineId ?? ""),
		) &&
		// Tombstones count toward settlement too: an archived-only host must
		// not read as a settled empty view while its archived query loads.
		(!includeArchived ||
			archivedQueries.every(
				(query, index) =>
					query.isSuccess || query.isError || targets[index]?.hostUrl === null,
			));

	const cache = useMemo<HostWorkspacesCacheOps>(() => {
		const targetFor = (hostId: string) =>
			targets.find((target) => target.machineId === hostId);
		return {
			resolveHostUrl: (hostId) => targetFor(hostId)?.hostUrl ?? null,
			isSandboxHost: (hostId) => targetFor(hostId)?.isSandbox === true,
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
			hasLiveTargets: targets.some((target) => target.hostUrl !== null),
			refetchAll: async () => {
				await Promise.all(
					targets
						.filter((target) => target.hostUrl !== null)
						.map((target) =>
							queryClient.refetchQueries({
								queryKey: getHostWorkspacesQueryKey(target),
							}),
						),
				);
			},
		};
	}, [targets, queryClient]);

	return { workspaces, isReady, hostsSettled: knownHostsSettled, cache };
}
