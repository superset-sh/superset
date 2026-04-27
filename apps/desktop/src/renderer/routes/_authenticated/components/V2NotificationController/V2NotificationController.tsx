import type { WorkspaceState } from "@superset/panes";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	HostNotificationSubscriber,
	type HostNotificationWorkspaceState,
} from "./components/HostNotificationSubscriber";

interface WorkspaceHostRow {
	workspaceId: string;
	organizationId: string;
	hostId: string;
	hostMachineId: string | null | undefined;
}

interface HostNotificationSubscriberGroup {
	hostUrl: string;
	workspaces: HostNotificationWorkspaceState[];
}

/**
 * Mounts one v2 notification listener per host-service URL so backgrounded
 * workspaces update their sidebar status indicator and play the finish sound.
 * Sibling to `AgentHooks`; rendered at the authenticated layout level.
 *
 * A host subscriber subscribes with workspaceId `*` and filters against the
 * workspaces assigned to that host. This keeps the topology O(1 listener per
 * host), not O(1 listener and settings observer per workspace).
 */
export function V2NotificationController() {
	const collections = useCollections();
	const { machineId, activeHostUrl } = useLocalHostService();
	const { data: workspaceHosts = [] } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.leftJoin(
					{ v2Hosts: collections.v2Hosts },
					({ v2Workspaces, v2Hosts }) =>
						eq(v2Workspaces.hostId, v2Hosts.machineId),
				)
				.select(({ v2Workspaces, v2Hosts }) => ({
					workspaceId: v2Workspaces.id,
					organizationId: v2Workspaces.organizationId,
					hostId: v2Workspaces.hostId,
					hostMachineId: v2Hosts?.machineId ?? null,
				})),
		[collections],
	);
	const { data: localWorkspaceRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
				.select(({ v2WorkspaceLocalState }) => ({
					workspaceId: v2WorkspaceLocalState.workspaceId,
					paneLayout: v2WorkspaceLocalState.paneLayout,
				})),
		[collections],
	);
	const hostGroups = useMemo(
		() =>
			groupWorkspacesByHostUrl({
				workspaceHosts,
				localWorkspaceRows,
				machineId,
				activeHostUrl,
			}),
		[workspaceHosts, localWorkspaceRows, machineId, activeHostUrl],
	);

	return (
		<>
			{hostGroups.map((group) => (
				<HostNotificationSubscriber
					key={group.hostUrl}
					hostUrl={group.hostUrl}
					workspaces={group.workspaces}
				/>
			))}
		</>
	);
}

function groupWorkspacesByHostUrl({
	workspaceHosts,
	localWorkspaceRows,
	machineId,
	activeHostUrl,
}: {
	workspaceHosts: WorkspaceHostRow[];
	localWorkspaceRows: Array<{
		workspaceId: string;
		paneLayout: unknown;
	}>;
	machineId: string | null;
	activeHostUrl: string | null;
}): HostNotificationSubscriberGroup[] {
	const paneLayoutsByWorkspaceId = new Map(
		localWorkspaceRows.map((row) => [
			row.workspaceId,
			row.paneLayout as WorkspaceState<PaneViewerData>,
		]),
	);
	const groups = new Map<string, HostNotificationWorkspaceState[]>();

	for (const workspace of workspaceHosts) {
		const hostUrl = getHostUrlForWorkspace({
			organizationId: workspace.organizationId,
			hostId: workspace.hostId,
			hostMachineId: workspace.hostMachineId,
			machineId,
			activeHostUrl,
		});
		if (!hostUrl) continue;

		const group = groups.get(hostUrl) ?? [];
		group.push({
			workspaceId: workspace.workspaceId,
			paneLayout: paneLayoutsByWorkspaceId.get(workspace.workspaceId) ?? null,
		});
		groups.set(hostUrl, group);
	}

	return [...groups.entries()].map(([hostUrl, workspaces]) => ({
		hostUrl,
		workspaces,
	}));
}

function getHostUrlForWorkspace({
	organizationId,
	hostId,
	hostMachineId,
	machineId,
	activeHostUrl,
}: {
	organizationId: string;
	hostId: string;
	hostMachineId: string | null | undefined;
	machineId: string | null;
	activeHostUrl: string | null;
}): string | null {
	if (hostMachineId && machineId && hostMachineId === machineId) {
		return activeHostUrl;
	}
	return `${env.RELAY_URL}/hosts/${buildHostRoutingKey(organizationId, hostId)}`;
}
