import type { WorkspaceState } from "@superset/panes";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffectEvent, useMemo } from "react";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useVisibleSidebarWorkspaceIds } from "renderer/routes/_authenticated/hooks/useVisibleSidebarWorkspaceIds";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { NOTIFICATION_EVENTS } from "shared/constants";
import type { AgentLifecycleEvent } from "shared/notification-types";
import {
	HostNotificationSubscriber,
	type HostNotificationWorkspaceState,
} from "./components/HostNotificationSubscriber";
import { markV2AgentLifecycleTargetSeen } from "./lib/lifecycleEvents";

interface WorkspaceHostRow {
	workspaceId: string;
	organizationId: string;
	hostId: string;
	name: string;
	branch: string;
}

interface HostNotificationSubscriberGroup {
	hostUrl: string;
	workspaces: HostNotificationWorkspaceState[];
}

type ElectronNotificationEventName =
	(typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS];

type ElectronNotificationEvent =
	| {
			type: typeof NOTIFICATION_EVENTS.AGENT_LIFECYCLE;
			data?: AgentLifecycleEvent;
	  }
	| {
			type: Exclude<
				ElectronNotificationEventName,
				typeof NOTIFICATION_EVENTS.AGENT_LIFECYCLE
			>;
			data?: unknown;
	  };

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
	const relayUrl = useRelayUrl();
	const visibleWorkspaceIds = useVisibleSidebarWorkspaceIds();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const allWorkspaceHosts = useMemo<WorkspaceHostRow[]>(
		() =>
			hostWorkspaces.map((workspace) => ({
				workspaceId: workspace.id,
				organizationId: workspace.organizationId,
				hostId: workspace.hostId,
				name: workspace.name,
				branch: workspace.branch,
			})),
		[hostWorkspaces],
	);
	const { data: allLocalWorkspaceRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
				.select(({ v2WorkspaceLocalState }) => ({
					workspaceId: v2WorkspaceLocalState.workspaceId,
					paneLayout: v2WorkspaceLocalState.paneLayout,
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

	const handleElectronAgentLifecycle = useEffectEvent(
		(event: ElectronNotificationEvent) => {
			if (event.type !== NOTIFICATION_EVENTS.AGENT_LIFECYCLE) return;
			const data = event.data;
			if (!data?.workspaceId || !data.terminalId) return;
			const workspace = workspaceStatesById.get(data.workspaceId);
			if (!workspace) return;

			// Adopted shells keep their launch-time host-service hook URL. When
			// that URL is stale, the Electron fallback still has terminal context.
			const eventType =
				data.eventType === "PendingQuestion"
					? "PermissionRequest"
					: data.eventType;
			markV2AgentLifecycleTargetSeen({
				workspaceId: data.workspaceId,
				payload: {
					eventType,
					terminalId: data.terminalId,
					occurredAt: Date.now(),
				},
				paneLayout: workspace.paneLayout,
			});

			// Statuses derive from host bindings, so the host must hear the
			// event too; the binding for an adopted agent persists host-side.
			if (activeHostUrl) {
				getHostServiceClientByUrl(activeHostUrl)
					.notifications.hook.mutate({
						terminalId: data.terminalId,
						eventType,
					})
					.catch((error) => {
						console.warn(
							"[notifications] failed to forward lifecycle event to host:",
							error,
						);
					});
			}
		},
	);

	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		onData: handleElectronAgentLifecycle,
	});

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

	const statesById = new Map(
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
			workspaceName:
				workspace.name.trim() || workspace.branch.trim() || "Workspace",
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
