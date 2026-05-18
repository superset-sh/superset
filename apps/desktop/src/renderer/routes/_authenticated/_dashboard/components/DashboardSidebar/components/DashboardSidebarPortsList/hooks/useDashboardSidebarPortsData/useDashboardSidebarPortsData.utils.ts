import { buildHostRoutingKey } from "@superset/shared/host-routing";
import type { PortChangedPayload } from "@superset/workspace-client";
import type { DetectedPort } from "shared/types";
import type { DashboardSidebarWorkspaceHostType } from "../../../../types";

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

type HostPortsMetadata = Pick<
	HostPortsResult,
	"hostId" | "hostType" | "hostUrl"
>;

export interface HostPortsQueryTarget {
	machineId: string;
	hostType: DashboardSidebarWorkspaceHostType;
	hostUrl: string;
	workspaceIds: string[];
}

export interface DashboardSidebarHostRow {
	organizationId: string;
	machineId: string;
	isOnline: boolean;
}

export interface DashboardSidebarWorkspaceRow {
	id: string;
	name: string;
	hostId: string;
}

export function getHostPortsQueryKey(host: HostPortsQueryTarget) {
	return [
		"host-service",
		"ports",
		"getAll",
		host.machineId,
		host.hostUrl,
		host.workspaceIds,
	] as const;
}

function getPortCacheKey(
	port: Pick<DetectedPort, "workspaceId" | "terminalId" | "port">,
): string {
	return `${port.workspaceId}:${port.terminalId}:${port.port}`;
}

function mergeSortedWorkspaceIds(
	left: readonly string[],
	right: readonly string[],
): string[] {
	return Array.from(new Set([...left, ...right])).sort();
}

export function applyPortEventsToHostPortsResult(
	result: HostPortsResult | undefined,
	events: PortChangedPayload[],
	host?: HostPortsMetadata,
): HostPortsResult | undefined {
	if (events.length === 0) return result;

	const initialResult =
		result ??
		(events.some((event) => event.eventType === "add") && host
			? { ...host, ports: [] }
			: undefined);
	if (!initialResult) return result;

	let ports = initialResult.ports;
	let changed = initialResult !== result;

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
	return { ...initialResult, ports };
}

export function deriveHostPortQueryTargets({
	activeHostUrl,
	hosts,
	machineId,
	relayUrl,
	workspaces,
}: {
	activeHostUrl: string | null;
	hosts: DashboardSidebarHostRow[];
	machineId: string | null;
	relayUrl: string;
	workspaces: DashboardSidebarWorkspaceRow[];
}): HostPortsQueryTarget[] {
	const workspaceIdsByHostId = new Map<string, string[]>();
	for (const workspace of workspaces) {
		const existing = workspaceIdsByHostId.get(workspace.hostId);
		if (existing) {
			existing.push(workspace.id);
		} else {
			workspaceIdsByHostId.set(workspace.hostId, [workspace.id]);
		}
	}
	for (const workspaceIds of workspaceIdsByHostId.values()) {
		workspaceIds.sort();
	}
	const allWorkspaceIds = workspaces
		.map((workspace) => workspace.id)
		.sort((a, b) => a.localeCompare(b));

	const targets = hosts.flatMap((host) => {
		const workspaceIds = workspaceIdsByHostId.get(host.machineId);
		if (!workspaceIds || workspaceIds.length === 0) return [];

		const isLocal = host.machineId === machineId;
		if (!isLocal && !host.isOnline) return [];

		const hostUrl = isLocal
			? activeHostUrl
			: `${relayUrl}/hosts/${buildHostRoutingKey(host.organizationId, host.machineId)}`;
		if (!hostUrl) return [];

		return [
			{
				machineId: host.machineId,
				hostType: isLocal
					? ("local-device" as const)
					: ("remote-device" as const),
				hostUrl,
				workspaceIds,
			},
		];
	});

	// v1 asked the local port manager for every tracked port. Keep v2's host
	// fan-out for remote ports, but make the active local host tolerant of
	// stale/missing Electric host mappings by allowing every known workspace id.
	if (machineId && activeHostUrl && allWorkspaceIds.length > 0) {
		const localTargetIndex = targets.findIndex(
			(target) => target.machineId === machineId,
		);
		if (localTargetIndex >= 0) {
			const localTarget = targets[localTargetIndex];
			if (localTarget) {
				targets[localTargetIndex] = {
					...localTarget,
					workspaceIds: mergeSortedWorkspaceIds(
						localTarget.workspaceIds,
						allWorkspaceIds,
					),
				};
			}
		} else {
			targets.push({
				machineId,
				hostType: "local-device",
				hostUrl: activeHostUrl,
				workspaceIds: allWorkspaceIds,
			});
		}
	}

	return targets;
}

export function groupDashboardSidebarPorts({
	hostPortResults,
	workspaces,
}: {
	hostPortResults: Array<HostPortsResult | undefined>;
	workspaces: DashboardSidebarWorkspaceRow[];
}): DashboardSidebarPortGroup[] {
	const workspacesById = new Map(
		workspaces.map((workspace) => [
			workspace.id,
			{
				name: workspace.name,
			},
		]),
	);
	const groupMap = new Map<string, DashboardSidebarPortGroup>();

	for (const result of hostPortResults) {
		if (!result) continue;

		for (const port of result.ports) {
			const workspace = workspacesById.get(port.workspaceId);
			if (!workspace) continue;

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
					hostType: result.hostType,
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
}
