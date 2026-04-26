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
	id: string;
	hostType: DashboardSidebarWorkspaceHostType;
	hostUrl: string;
	workspaceIds: string[];
}

export interface DashboardSidebarHostRow {
	id: string;
	isOnline: boolean;
	machineId: string | null | undefined;
}

export interface DashboardSidebarWorkspaceRow {
	id: string;
	name: string;
	hostId: string;
	hostMachineId: string | null | undefined;
}

export function getHostPortsQueryKey(host: HostPortsQueryTarget) {
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

	return hosts.flatMap((host) => {
		const workspaceIds = workspaceIdsByHostId.get(host.id);
		if (!workspaceIds || workspaceIds.length === 0) return [];

		const isLocal = host.machineId === machineId;
		if (!isLocal && !host.isOnline) return [];

		const hostUrl = isLocal ? activeHostUrl : `${relayUrl}/hosts/${host.id}`;
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
	});
}

export function groupDashboardSidebarPorts({
	hostPortResults,
	machineId,
	workspaces,
}: {
	hostPortResults: Array<HostPortsResult | undefined>;
	machineId: string | null;
	workspaces: DashboardSidebarWorkspaceRow[];
}): DashboardSidebarPortGroup[] {
	const workspacesById = new Map(
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
	);
	const groupMap = new Map<string, DashboardSidebarPortGroup>();

	for (const result of hostPortResults) {
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
}
