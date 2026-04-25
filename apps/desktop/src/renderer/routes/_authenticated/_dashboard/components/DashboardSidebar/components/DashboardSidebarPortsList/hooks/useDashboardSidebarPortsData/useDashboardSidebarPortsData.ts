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
import type { DetectedPort } from "shared/types";
import type { DashboardSidebarWorkspaceHostType } from "../../../../types";

const PORTS_FALLBACK_REFETCH_INTERVAL_MS = 30_000;
const PORT_EVENT_CACHE_BATCH_DELAY_MS = 100;

export interface DashboardSidebarPort extends RemotePort {
	hostId: string;
	hostType: DashboardSidebarWorkspaceHostType;
	hostUrl: string;
}

interface RemotePort extends DetectedPort {
	label: string | null;
}

export interface DashboardSidebarPortGroup {
	workspaceId: string;
	workspaceName: string;
	hostType: DashboardSidebarWorkspaceHostType;
	ports: DashboardSidebarPort[];
}

export interface DashboardSidebarPortsLoadError {
	hostId: string;
	hostType: DashboardSidebarWorkspaceHostType;
	message: string;
}

export interface HostPortsResult {
	hostId: string;
	hostType: DashboardSidebarWorkspaceHostType;
	hostUrl: string;
	ports: RemotePort[];
}

interface HostPortsQueryTarget {
	id: string;
	hostType: DashboardSidebarWorkspaceHostType;
	hostUrl: string;
	workspaceIds: string[];
}

function getHostPortsQueryKey(host: HostPortsQueryTarget) {
	return [
		"host-service",
		"ports",
		"getAll",
		host.id,
		host.hostUrl,
		host.workspaceIds,
	] as const;
}

function getPortCacheKey(
	port: Pick<DetectedPort, "workspaceId" | "terminalId" | "port">,
): string {
	return `${port.workspaceId}:${port.terminalId}:${port.port}`;
}

export function applyPortEventsToHostPortsResult(
	result: HostPortsResult | undefined,
	events: PortChangedPayload[],
): HostPortsResult | undefined {
	if (!result || events.length === 0) return result;

	let ports = result.ports;
	let changed = false;

	for (const event of events) {
		const eventPortKey = getPortCacheKey(event.port);
		const portsWithoutEventPort = ports.filter(
			(port) => getPortCacheKey(port) !== eventPortKey,
		);
		if (portsWithoutEventPort.length !== ports.length) {
			changed = true;
		}

		if (event.eventType === "add") {
			ports = [...portsWithoutEventPort, { ...event.port, label: event.label }];
			changed = true;
		} else {
			ports = portsWithoutEventPort;
		}
	}

	if (!changed) return result;
	return { ...result, ports };
}

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

	const workspaceIdsByHostId = useMemo(() => {
		const map = new Map<string, string[]>();
		for (const workspace of workspaces) {
			const existing = map.get(workspace.hostId);
			if (existing) {
				existing.push(workspace.id);
			} else {
				map.set(workspace.hostId, [workspace.id]);
			}
		}
		for (const workspaceIds of map.values()) {
			workspaceIds.sort();
		}
		return map;
	}, [workspaces]);

	const hostsToQuery = useMemo<HostPortsQueryTarget[]>(
		() =>
			hosts.flatMap((host) => {
				const workspaceIds = workspaceIdsByHostId.get(host.id);
				if (!workspaceIds || workspaceIds.length === 0) return [];
				const isLocal = host.machineId === machineId;
				if (!isLocal && !host.isOnline) return [];
				const hostUrl = isLocal
					? activeHostUrl
					: `${env.RELAY_URL}/hosts/${host.id}`;
				if (!hostUrl) return [];
				return [
					{
						id: host.id,
						hostType: isLocal
							? ("local-device" as const)
							: ("remote-device" as const),
						hostUrl,
						workspaceIds,
					},
				];
			}),
		[activeHostUrl, hosts, machineId, workspaceIdsByHostId],
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
				queryClient.setQueryData<HostPortsResult | undefined>(
					getHostPortsQueryKey(host),
					(result) => applyPortEventsToHostPortsResult(result, events),
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
			cleanups.push(removeListener, bus.retain(), () => {
				if (cacheUpdateTimer) clearTimeout(cacheUpdateTimer);
			});
		}

		return () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		};
	}, [hostsToQuery, queryClient]);

	const workspacesById = useMemo(
		() =>
			new Map(
				workspaces.map((workspace) => [
					workspace.id,
					{
						name: workspace.name,
						hostId: workspace.hostId,
						hostType:
							workspace.hostMachineId == null
								? ("cloud" as const)
								: workspace.hostMachineId === machineId
									? ("local-device" as const)
									: ("remote-device" as const),
					},
				]),
			),
		[machineId, workspaces],
	);

	const workspacePortGroups = useMemo(() => {
		const groupMap = new Map<string, DashboardSidebarPortGroup>();

		for (const query of queries) {
			const result = query.data;
			if (!result) continue;

			for (const port of result.ports) {
				const workspace = workspacesById.get(port.workspaceId);
				if (!workspace) continue;
				if (workspace.hostId !== result.hostId) continue;

				const dashboardPort: DashboardSidebarPort = {
					...port,
					hostId: result.hostId,
					hostType: result.hostType,
					hostUrl: result.hostUrl,
				};

				const existing = groupMap.get(port.workspaceId);
				if (existing) {
					existing.ports.push(dashboardPort);
				} else {
					groupMap.set(port.workspaceId, {
						workspaceId: port.workspaceId,
						workspaceName: workspace.name,
						hostType: workspace.hostType,
						ports: [dashboardPort],
					});
				}
			}
		}

		return Array.from(groupMap.values())
			.map((group) => ({
				...group,
				ports: group.ports.sort((a, b) => a.port - b.port),
			}))
			.sort((a, b) => a.workspaceName.localeCompare(b.workspaceName));
	}, [queries, workspacesById]);

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
