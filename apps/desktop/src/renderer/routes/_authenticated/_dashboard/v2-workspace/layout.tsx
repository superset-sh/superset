import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { env } from "renderer/env.renderer";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { WorkspaceNotFoundState } from "./components/WorkspaceNotFoundState";
import { WorkspaceTrpcProvider } from "./providers/WorkspaceTrpcProvider";

export const Route = createFileRoute("/_authenticated/_dashboard/v2-workspace")(
	{
		component: V2WorkspaceLayout,
	},
);

function V2WorkspaceLayout() {
	const matchRoute = useMatchRoute();
	const workspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
	});
	const workspaceId =
		workspaceMatch !== false ? workspaceMatch.workspaceId : null;
	const collections = useCollections();
	const { machineId, activeHostUrl } = useLocalHostService();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();

	const { data: workspacesWithHost = [], isReady } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.leftJoin({ hosts: collections.v2Hosts }, ({ v2Workspaces, hosts }) =>
					eq(v2Workspaces.hostId, hosts.machineId),
				)
				.where(({ v2Workspaces }) => eq(v2Workspaces.id, workspaceId ?? ""))
				.select(({ v2Workspaces, hosts }) => ({
					id: v2Workspaces.id,
					organizationId: v2Workspaces.organizationId,
					hostId: v2Workspaces.hostId,
					hostMachineId: hosts?.machineId ?? null,
					projectId: v2Workspaces.projectId,
					branch: v2Workspaces.branch,
				})),
		[collections, workspaceId],
	);
	const workspace = workspacesWithHost[0] ?? null;

	const isLocal = workspace?.hostMachineId === machineId;
	const hostUrl = !workspace
		? null
		: isLocal
			? activeHostUrl
			: `${env.RELAY_URL}/hosts/${buildHostRoutingKey(workspace.organizationId, workspace.hostId)}`;

	const lastEnsuredWorkspaceIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (!workspace || lastEnsuredWorkspaceIdRef.current === workspace.id)
			return;
		lastEnsuredWorkspaceIdRef.current = workspace.id;
		ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
	}, [ensureWorkspaceInSidebar, workspace]);

	if (!workspaceId || !isReady) {
		return null;
	}

	if (!workspace || !hostUrl) {
		return <WorkspaceNotFoundState workspaceId={workspaceId} />;
	}

	return (
		<WorkspaceTrpcProvider
			cacheKey={workspace.id}
			key={`${workspace.id}:${hostUrl}`}
			hostUrl={hostUrl}
			headers={() => getHostServiceHeaders(hostUrl)}
			wsToken={() => getHostServiceWsToken(hostUrl)}
		>
			<Outlet />
		</WorkspaceTrpcProvider>
	);
}
