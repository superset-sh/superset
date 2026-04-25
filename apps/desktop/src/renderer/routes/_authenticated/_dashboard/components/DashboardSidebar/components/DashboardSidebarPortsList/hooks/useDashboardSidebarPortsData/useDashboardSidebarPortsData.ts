import {
	getEventBus,
	type PortChangedPayload,
} from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { env } from "renderer/env.renderer";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	applyPortEventsToHostPortsResult,
	type DashboardSidebarPortGroup,
	type DashboardSidebarPortsLoadError,
	deriveHostPortQueryTargets,
	getHostPortsQueryKey,
	groupDashboardSidebarPorts,
	type HostPortsResult,
} from "./useDashboardSidebarPortsData.utils";

export type {
	DashboardSidebarPort,
	DashboardSidebarPortGroup,
} from "./useDashboardSidebarPortsData.utils";

const PORTS_FALLBACK_REFETCH_INTERVAL_MS = 30_000;
const PORT_EVENT_CACHE_BATCH_DELAY_MS = 100;

export function useDashboardSidebarPortsData(): {
	workspacePortGroups: DashboardSidebarPortGroup[];
	totalPortCount: number;
	portLoadErrors: DashboardSidebarPortsLoadError[];
} {
	const collections = useCollections();
	const queryClient = useQueryClient();
	const { activeHostUrl, machineId } = useLocalHostService();

	const { data: hosts = [] } = useLiveQuery(
		(q) =>
			q.from({ hosts: collections.v2Hosts }).select(({ hosts }) => ({
				id: hosts.id,
				isOnline: hosts.isOnline,
				machineId: hosts.machineId,
			})),
		[collections],
	);

	const { data: workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.leftJoin({ hosts: collections.v2Hosts }, ({ workspaces, hosts }) =>
					eq(workspaces.hostId, hosts.id),
				)
				.select(({ workspaces, hosts }) => ({
					id: workspaces.id,
					name: workspaces.name,
					hostId: workspaces.hostId,
					hostMachineId: hosts?.machineId ?? null,
				})),
		[collections],
	);

	const hostsToQuery = useMemo(
		() =>
			deriveHostPortQueryTargets({
				activeHostUrl,
				hosts,
				machineId,
				relayUrl: env.RELAY_URL,
				workspaces,
			}),
		[activeHostUrl, hosts, machineId, workspaces],
	);

	const queries = useQueries({
		queries: hostsToQuery.map((host) => ({
			queryKey: getHostPortsQueryKey(host),
			refetchInterval: PORTS_FALLBACK_REFETCH_INTERVAL_MS,
			queryFn: async (): Promise<HostPortsResult> => {
				const client = getHostServiceClientByUrl(host.hostUrl);
				const ports = await client.ports.getAll.query({
					workspaceIds: host.workspaceIds,
				});
				return {
					hostId: host.id,
					hostType: host.hostType,
					hostUrl: host.hostUrl,
					ports,
				};
			},
		})),
	});

	useEffect(() => {
		const cleanups: Array<() => void> = [];

		for (const host of hostsToQuery) {
			const workspaceIds = new Set(host.workspaceIds);
			const pendingEvents: PortChangedPayload[] = [];
			let cacheUpdateTimer: ReturnType<typeof setTimeout> | null = null;
			const flushPortEvents = () => {
				cacheUpdateTimer = null;
				const events = pendingEvents.splice(0);
				if (events.length === 0) return;
				queryClient.setQueryData<HostPortsResult | undefined>(
					getHostPortsQueryKey(host),
					(result) =>
						applyPortEventsToHostPortsResult(result, events, {
							hostId: host.id,
							hostType: host.hostType,
							hostUrl: host.hostUrl,
						}),
				);
			};
			const enqueuePortEvent = (event: PortChangedPayload) => {
				pendingEvents.push(event);
				if (cacheUpdateTimer) return;
				cacheUpdateTimer = setTimeout(
					flushPortEvents,
					PORT_EVENT_CACHE_BATCH_DELAY_MS,
				);
			};
			const bus = getEventBus(host.hostUrl, () =>
				getHostServiceWsToken(host.hostUrl),
			);
			const removeListener = bus.on(
				"port:changed",
				"*",
				(workspaceId, event) => {
					if (!workspaceIds.has(workspaceId)) return;
					enqueuePortEvent(event);
				},
			);
			const releaseBus = bus.retain();
			cleanups.push(() => {
				if (cacheUpdateTimer) {
					clearTimeout(cacheUpdateTimer);
					cacheUpdateTimer = null;
				}
				flushPortEvents();
				removeListener();
				releaseBus();
			});
		}

		return () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		};
	}, [hostsToQuery, queryClient]);

	const workspacePortGroups = useMemo(
		() =>
			groupDashboardSidebarPorts({
				hostPortResults: queries.map((query) => query.data),
				machineId,
				workspaces,
			}),
		[queries, machineId, workspaces],
	);

	const totalPortCount = workspacePortGroups.reduce(
		(sum, group) => sum + group.ports.length,
		0,
	);

	const portLoadErrors = queries.flatMap((query, index) => {
		if (!query.isError && !query.isRefetchError) return [];
		const host = hostsToQuery[index];
		if (!host) return [];
		return [
			{
				hostId: host.id,
				hostType: host.hostType,
				message:
					query.error instanceof Error
						? query.error.message
						: "Unable to load ports",
			},
		];
	});

	return {
		workspacePortGroups,
		totalPortCount,
		portLoadErrors,
	};
}
