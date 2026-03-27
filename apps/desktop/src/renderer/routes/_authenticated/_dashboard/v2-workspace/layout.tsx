import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { getWorkspaceHostUrlForWorkspace } from "renderer/lib/v2-workspace-host";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostService } from "renderer/routes/_authenticated/providers/HostServiceProvider";
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
	const { services } = useHostService();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const { data: deviceInfo, isPending: isDeviceInfoPending } =
		electronTrpc.auth.getDeviceInfo.useQuery();

	const { data: workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.where(({ v2Workspaces }) => eq(v2Workspaces.id, workspaceId ?? "")),
		[collections, workspaceId],
	);
	const workspace = workspaces[0] ?? null;
	const { data: currentDevices = [] } = useLiveQuery(
		(q) =>
			q
				.from({ v2Devices: collections.v2Devices })
				.where(({ v2Devices }) =>
					and(
						eq(v2Devices.clientId, deviceInfo?.deviceId ?? ""),
						eq(v2Devices.organizationId, workspace?.organizationId ?? ""),
					),
				),
		[collections, deviceInfo?.deviceId, workspace?.organizationId],
	);
	const currentDevice = currentDevices[0] ?? null;
	const localHostUrl = workspace
		? (services.get(workspace.organizationId)?.url ?? null)
		: null;
	const shouldWaitForDeviceInfo = workspace !== null && isDeviceInfoPending;
	const isLocal = workspace?.deviceId === currentDevice?.id;
	const hostUrl =
		!workspace || shouldWaitForDeviceInfo
			? null
			: isLocal
				? localHostUrl
				: getWorkspaceHostUrlForWorkspace(workspace.id);

	const lastEnsuredWorkspaceIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (!workspace || lastEnsuredWorkspaceIdRef.current === workspace.id)
			return;
		lastEnsuredWorkspaceIdRef.current = workspace.id;
		ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
	}, [ensureWorkspaceInSidebar, workspace]);

	if (!workspaceId || !workspace) {
		return <Outlet />;
	}

	if (shouldWaitForDeviceInfo) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				Resolving workspace host...
			</div>
		);
	}

	if (!hostUrl) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				Workspace host service not available
			</div>
		);
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
