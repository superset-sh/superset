import { getEventBus } from "@superset/workspace-client";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
	applyWorkspaceChangedEvent,
	deriveHostWorkspacesQueryTargets,
	getHostWorkspacesQueryKey,
	type HostWorkspaceItem,
	type HostWorkspaceRow,
	loadHostWorkspacesSnapshot,
	saveHostWorkspacesSnapshot,
} from "renderer/hooks/host-workspaces/useHostWorkspaces/useHostWorkspaces.utils";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

const WORKSPACES_FALLBACK_REFETCH_INTERVAL_MS = 30_000;

export interface UseSelectedHostWorkspacesResult {
	rows: HostWorkspaceItem[];
	/** The selected host answered, failed, or served a snapshot. */
	isReady: boolean;
}

/**
 * Single-host workspace read: `workspace.list` against exactly one host
 * (local direct, remote via relay), live-updated by that host's
 * `workspace:changed` events, with the last-seen IndexedDB snapshot for
 * offline. Deliberately no fan-out and no Electric `v2Workspaces` fallback —
 * an unreachable host shows its snapshot or nothing, never stale cloud rows.
 *
 * Shares query keys with useHostWorkspacesSource, so where that provider is
 * mounted the host's list is fetched once, not twice.
 */
export function useSelectedHostWorkspaces(
	hostId: string | null,
): UseSelectedHostWorkspacesResult {
	const collections = useCollections();
	const queryClient = useQueryClient();
	const { activeHostUrl, machineId } = useLocalHostService();
	const relayUrl = useRelayUrl();

	const { data: hostRows = [] } = useLiveQuery(
		(q) =>
			q.from({ hosts: collections.v2Hosts }).select(({ hosts }) => ({
				organizationId: hosts.organizationId,
				machineId: hosts.machineId,
				isOnline: hosts.isOnline,
			})),
		[collections],
	);

	const target = useMemo(() => {
		if (hostId == null) return null;
		return (
			deriveHostWorkspacesQueryTargets({
				activeHostUrl,
				hosts: hostRows,
				machineId,
				relayUrl,
			}).find((candidate) => candidate.machineId === hostId) ?? null
		);
	}, [hostId, activeHostUrl, hostRows, machineId, relayUrl]);

	const [snapshot, setSnapshot] = useState<{
		key: string;
		rows: HostWorkspaceRow[];
	} | null>(null);
	const snapshotKey = target
		? `${target.organizationId}:${target.machineId}`
		: null;
	useEffect(() => {
		if (!target || !snapshotKey) return;
		let cancelled = false;
		void loadHostWorkspacesSnapshot(
			target.organizationId,
			target.machineId,
		).then((rows) => {
			if (cancelled || !rows) return;
			setSnapshot({ key: snapshotKey, rows });
		});
		return () => {
			cancelled = true;
		};
	}, [target, snapshotKey]);
	const snapshotRows =
		snapshot && snapshot.key === snapshotKey ? snapshot.rows : undefined;

	const query = useQuery({
		queryKey: target
			? getHostWorkspacesQueryKey(target)
			: (["host-service", "workspaces", "list", "none", null] as const),
		enabled: target?.hostUrl != null,
		refetchInterval: WORKSPACES_FALLBACK_REFETCH_INTERVAL_MS,
		// The local host is reachable at 127.0.0.1 even with the machine
		// offline — the default "online" networkMode would pause the query.
		networkMode: "always",
		// The interval heals missed workspace:changed events; keep it running
		// while the window is backgrounded.
		refetchIntervalInBackground: true,
		retry: 1,
		queryFn: async (): Promise<HostWorkspaceRow[]> => {
			if (!target?.hostUrl) return [];
			const client = getHostServiceClientByUrl(target.hostUrl);
			const rows = (await client.workspace.list.query()) as HostWorkspaceRow[];
			saveHostWorkspacesSnapshot(target.organizationId, target.machineId, rows);
			return rows;
		},
	});

	useEffect(() => {
		if (!target?.hostUrl) return;
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
		return () => {
			removeListener();
			releaseBus();
		};
	}, [target, queryClient]);

	const live = query.data;
	const reachable = live !== undefined && !query.isError;
	const rawRows = live ?? snapshotRows;
	const rows = useMemo<HostWorkspaceItem[]>(
		() =>
			(rawRows ?? []).map((row) => ({
				...row,
				hostReachable: reachable,
				source: "host" as const,
			})),
		[rawRows, reachable],
	);

	const isReady =
		target != null &&
		(query.isSuccess ||
			query.isError ||
			target.hostUrl === null ||
			snapshotRows !== undefined);

	return { rows, isReady };
}
