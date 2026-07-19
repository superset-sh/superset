import { getEventBus } from "@superset/workspace-client";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { env } from "renderer/env.renderer";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";
import {
	applyProjectChangedEvent,
	deriveHostProjectsQueryTargets,
	getHostProjectsQueryKey,
	type HostProjectItem,
	type HostProjectRow,
	loadHostProjectsSnapshot,
	mergeHostProjects,
	normalizeHostProjectRow,
	removeFromHostProjectsSnapshot,
	saveHostProjectsSnapshot,
} from "./useHostProjects.utils";

export type {
	HostProjectItem,
	HostProjectRow,
} from "./useHostProjects.utils";

const PROJECTS_FALLBACK_REFETCH_INTERVAL_MS = 30_000;

export interface UseHostProjectsResult {
	projects: HostProjectItem[];
	/**
	 * True once every host answered, failed, or served a snapshot. Gates
	 * empty states only — existing rows always render (cache-first rule).
	 */
	isReady: boolean;
}

/**
 * The project read path: fan out `project.list` to every known host (local
 * direct, remote via relay), merge per-row, live-update from each host's
 * `project:changed` events, and persist last-seen lists per host to
 * IndexedDB. Projects are fully local — there is no cloud source.
 */
export function useHostProjects(): UseHostProjectsResult {
	const collections = useCollections();
	const queryClient = useQueryClient();
	const { activeHostUrl, machineId } = useLocalHostService();
	const relayUrl = useRelayUrl();
	const { data: session } = authClient.useSession();
	const fallbackOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: hosts = [] } = useLiveQuery(
		(q) =>
			q.from({ hosts: collections.v2Hosts }).select(({ hosts }) => ({
				organizationId: hosts.organizationId,
				machineId: hosts.machineId,
				isOnline: hosts.isOnline,
			})),
		[collections],
	);

	const targets = useMemo(
		() =>
			deriveHostProjectsQueryTargets({
				activeHostUrl,
				hosts,
				machineId,
				relayUrl,
				fallbackOrganizationId,
			}),
		[activeHostUrl, hosts, machineId, relayUrl, fallbackOrganizationId],
	);

	// Last-seen snapshots hydrate once per (org, host); live data always wins.
	const [snapshots, setSnapshots] = useState<Map<string, HostProjectRow[]>>(
		() => new Map(),
	);
	// Deletes observed this session, so an in-flight snapshot load (which
	// read the pre-delete value) can't resurrect a deleted project.
	const deletedIdsRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		let cancelled = false;
		for (const target of targets) {
			if (snapshots.has(target.machineId)) continue;
			void loadHostProjectsSnapshot(
				target.organizationId,
				target.machineId,
			).then((rows) => {
				if (cancelled || !rows) return;
				const fresh = rows.filter((row) => !deletedIdsRef.current.has(row.id));
				setSnapshots((prev) => {
					if (prev.has(target.machineId)) return prev;
					const next = new Map(prev);
					next.set(target.machineId, fresh);
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
			queryKey: getHostProjectsQueryKey(target),
			enabled: target.hostUrl !== null,
			refetchInterval: PROJECTS_FALLBACK_REFETCH_INTERVAL_MS,
			// See useHostWorkspaces: "online" networkMode would pause 127.0.0.1
			// queries when navigator.onLine is false, defeating offline-first.
			networkMode: "always" as const,
			refetchIntervalInBackground: true,
			retry: 1,
			queryFn: async (): Promise<HostProjectRow[]> => {
				if (!target.hostUrl) return [];
				const client = getHostServiceClientByUrl(target.hostUrl);
				// Normalize per-row: remote hosts on pre-local-first builds
				// don't serve name/createdAt/updatedAt yet.
				const rows = (
					(await client.project.list.query()) as Array<
						Partial<HostProjectRow> & { id: string; repoPath: string }
					>
				).map(normalizeHostProjectRow);
				saveHostProjectsSnapshot(target.organizationId, target.machineId, rows);
				return rows;
			},
		})),
	});

	// Live updates: each reachable host's project:changed patches its own
	// cached list (and the snapshot) without a refetch.
	useEffect(() => {
		const cleanups: Array<() => void> = [];
		for (const target of targets) {
			if (!target.hostUrl) continue;
			const hostUrl = target.hostUrl;
			const bus = getEventBus(hostUrl, () => getHostServiceWsToken(hostUrl));
			const removeListener = bus.on(
				"project:changed",
				"*",
				(projectId, event) => {
					if (event.eventType === "deleted") {
						// Also purge hydrated/persisted snapshots — a deleted event
						// arriving before the query cache hydrates must not let a
						// stale snapshot resurrect the project.
						deletedIdsRef.current.add(projectId);
						void removeFromHostProjectsSnapshot(
							target.organizationId,
							target.machineId,
							projectId,
						).catch((err) => {
							console.warn("[useHostProjects] snapshot purge failed", {
								projectId,
								err,
							});
						});
						setSnapshots((prev) => {
							const rows = prev.get(target.machineId);
							if (!rows?.some((row) => row.id === projectId)) return prev;
							const next = new Map(prev);
							next.set(
								target.machineId,
								rows.filter((row) => row.id !== projectId),
							);
							return next;
						});
					}
					queryClient.setQueryData<HostProjectRow[] | undefined>(
						getHostProjectsQueryKey(target),
						(rows) => {
							const next = applyProjectChangedEvent(rows, event, projectId);
							if (next && next !== rows) {
								saveHostProjectsSnapshot(
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

	const projects = useMemo(
		() =>
			mergeHostProjects({
				hostResults: targets.map((target, index) => {
					const query = queries[index];
					const live = query?.data;
					return {
						target,
						rows: live ?? snapshots.get(target.machineId),
						reachable: live !== undefined && !query?.isError,
					};
				}),
			}),
		[targets, queries, snapshots],
	);

	// Never vacuously ready: zero targets means host discovery hasn't run
	// yet (cold start), not "no projects exist".
	const isReady =
		targets.length > 0 &&
		queries.every(
			(query, index) =>
				query.isSuccess ||
				query.isError ||
				targets[index]?.hostUrl === null ||
				snapshots.has(targets[index]?.machineId ?? ""),
		);

	return { projects, isReady };
}
