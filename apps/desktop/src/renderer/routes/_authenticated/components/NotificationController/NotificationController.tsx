import type { WorkspaceState } from "@superset/panes";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/types";
import { useVisibleSidebarWorkspaceIds } from "renderer/routes/_authenticated/hooks/useVisibleSidebarWorkspaceIds";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	HostNotificationSubscriber,
	type HostNotificationWorkspaceState,
} from "./components/HostNotificationSubscriber";
import { getNotificationWorkspaceName } from "./lib/getNotificationWorkspaceName";

interface WorkspaceHostRow {
	workspaceId: string;
	organizationId: string;
	hostId: string;
	type: "local" | "worktree" | "session";
	name: string;
	projectName?: string;
	branch: string;
}

interface HostNotificationSubscriberGroup {
	hostUrl: string;
	workspaces: HostNotificationWorkspaceState[];
}

/**
 * Mounts one notification listener per host-service URL so backgrounded
 * workspaces update their sidebar status indicator and play the finish sound.
 * Sibling to `AgentHooks`; rendered at the authenticated layout level.
 *
 * A host subscriber subscribes with workspaceId `*` and filters against the
 * workspaces assigned to that host. This keeps the topology O(1 listener per
 * host), not O(1 listener and settings observer per workspace).
 */
export function NotificationController() {
	const collections = useCollections();
	const { projects } = useHostProjects();
	const { machineId, activeHostUrl } = useLocalHostService();
	const relayUrl = useRelayUrl();
	const visibleWorkspaceIds = useVisibleSidebarWorkspaceIds();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const allWorkspaceHosts = useMemo<WorkspaceHostRow[]>(
		() =>
			hostWorkspaces.map((workspace) => ({
				workspaceId: workspace.id,
				organizationId: workspace.organizationId,
				hostId: workspace.hostId,
				type: workspace.type,
				name: workspace.name,
				projectName: projects.find(
					(project) => project.id === workspace.projectId,
				)?.name,
				branch: workspace.branch,
			})),
		[hostWorkspaces, projects],
	);
	const { data: allLocalWorkspaceRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaceLocalState: collections.workspaceLocalState })
				.select(({ workspaceLocalState }) => ({
					workspaceId: workspaceLocalState.workspaceId,
					paneLayout: workspaceLocalState.paneLayout,
				})),
		[collections],
	);
	const workspaceHosts = useMemo(
		() =>
			allWorkspaceHosts.filter((workspace) =>
				visibleWorkspaceIds.has(workspace.workspaceId),
			),
		[allWorkspaceHosts, visibleWorkspaceIds],
	);
	const localWorkspaceRows = useMemo(
		() =>
			allLocalWorkspaceRows.filter((workspace) =>
				visibleWorkspaceIds.has(workspace.workspaceId),
			),
		[allLocalWorkspaceRows, visibleWorkspaceIds],
	);
	const workspaceStatesById = useMemo(
		() =>
			getNotificationWorkspaceStatesById({
				workspaceHosts,
				localWorkspaceRows,
			}),
		[workspaceHosts, localWorkspaceRows],
	);
	const hostGroups = useMemo(
		() =>
			groupWorkspacesByHostUrl({
				workspaceHosts,
				workspaceStatesById,
				machineId,
				activeHostUrl,
				relayUrl,
			}),
		[workspaceHosts, workspaceStatesById, machineId, activeHostUrl, relayUrl],
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

function getNotificationWorkspaceStatesById({
	workspaceHosts,
	localWorkspaceRows,
}: {
	workspaceHosts: WorkspaceHostRow[];
	localWorkspaceRows: Array<{
		workspaceId: string;
		paneLayout: unknown;
	}>;
}): Map<string, HostNotificationWorkspaceState> {
	const paneLayoutsByWorkspaceId = new Map(
		localWorkspaceRows.map((row) => [
			row.workspaceId,
			row.paneLayout as WorkspaceState<PaneViewerData>,
		]),
	);

	const statesById = new Map<string, HostNotificationWorkspaceState>(
		localWorkspaceRows.map((row) => [
			row.workspaceId,
			{
				workspaceId: row.workspaceId,
				workspaceName: "Workspace",
				paneLayout: paneLayoutsByWorkspaceId.get(row.workspaceId) ?? null,
			},
		]),
	);

	for (const workspace of workspaceHosts) {
		statesById.set(workspace.workspaceId, {
			workspaceId: workspace.workspaceId,
			workspaceName: getNotificationWorkspaceName(workspace),
			projectName: workspace.projectName,
			paneLayout: paneLayoutsByWorkspaceId.get(workspace.workspaceId) ?? null,
		});
	}

	return statesById;
}

function groupWorkspacesByHostUrl({
	workspaceHosts,
	workspaceStatesById,
	machineId,
	activeHostUrl,
	relayUrl,
}: {
	workspaceHosts: WorkspaceHostRow[];
	workspaceStatesById: Map<string, HostNotificationWorkspaceState>;
	machineId: string | null;
	activeHostUrl: string | null;
	relayUrl: string;
}): HostNotificationSubscriberGroup[] {
	const groups = new Map<string, HostNotificationWorkspaceState[]>();
	const hostedWorkspaceIds = new Set<string>();

	for (const workspace of workspaceHosts) {
		const hostUrl = getHostUrlForWorkspace({
			organizationId: workspace.organizationId,
			hostId: workspace.hostId,
			machineId,
			activeHostUrl,
			relayUrl,
		});
		if (!hostUrl) continue;

		const group = groups.get(hostUrl) ?? [];
		const state = workspaceStatesById.get(workspace.workspaceId);
		if (state) group.push(state);
		groups.set(hostUrl, group);
		hostedWorkspaceIds.add(workspace.workspaceId);
	}

	if (activeHostUrl) {
		const localGroup = groups.get(activeHostUrl) ?? [];
		for (const state of workspaceStatesById.values()) {
			if (hostedWorkspaceIds.has(state.workspaceId)) continue;
			localGroup.push(state);
		}
		if (localGroup.length > 0) {
			groups.set(activeHostUrl, localGroup);
		}
	}

	return [...groups.entries()].map(([hostUrl, workspaces]) => ({
		hostUrl,
		workspaces,
	}));
}

function getHostUrlForWorkspace({
	organizationId,
	hostId,
	machineId,
	activeHostUrl,
	relayUrl,
}: {
	organizationId: string;
	hostId: string;
	machineId: string | null;
	activeHostUrl: string | null;
	relayUrl: string;
}): string | null {
	if (machineId && hostId === machineId) {
		return activeHostUrl;
	}
	return `${relayUrl}/hosts/${buildHostRoutingKey(organizationId, hostId)}`;
}
