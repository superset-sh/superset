import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getWorkspaceHostUrlForWorkspace } from "renderer/lib/v2-workspace-host";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	getSshHostServiceKey,
	useHostService,
} from "renderer/routes/_authenticated/providers/HostServiceProvider";
import { getSshHostIdFromDeviceClientId } from "shared/ssh-hosts";
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
	const { services, sshHosts, sshStatuses } = useHostService();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const { data: deviceInfo, isPending: isDeviceInfoPending } =
		electronTrpc.auth.getDeviceInfo.useQuery();

	const { data: workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.leftJoin(
					{ devices: collections.v2Devices },
					({ workspaces, devices }) => eq(workspaces.deviceId, devices.id),
				)
				.where(({ workspaces }) => eq(workspaces.id, workspaceId ?? ""))
				.select(({ devices, workspaces }) => ({
					...workspaces,
					deviceClientId: devices?.clientId ?? null,
					deviceName: devices?.name ?? null,
					deviceType: devices?.type ?? null,
				})),
		[collections, workspaceId],
	);
	const workspace = workspaces[0] ?? null;
	const localHostUrl = workspace
		? (services.get(workspace.organizationId)?.url ?? null)
		: null;
	const shouldWaitForDeviceInfo = workspace !== null && isDeviceInfoPending;
	const sshHostId = getSshHostIdFromDeviceClientId(workspace?.deviceClientId);
	const sshStatus =
		workspace && sshHostId
			? (sshStatuses.get(
					getSshHostServiceKey(workspace.organizationId, sshHostId),
				) ?? null)
			: null;
	const sshHost =
		sshHostId === null
			? null
			: (sshHosts.find((host) => host.id === sshHostId) ?? null);
	const hostUrl =
		!workspace || shouldWaitForDeviceInfo
			? null
			: workspace.deviceClientId === deviceInfo?.deviceId
				? localHostUrl
				: sshHostId
					? (sshStatus?.hostUrl ?? null)
					: getWorkspaceHostUrlForWorkspace(workspace.id);
	const lastEnsuredWorkspaceIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (!workspace || lastEnsuredWorkspaceIdRef.current === workspace.id) {
			return;
		}
		lastEnsuredWorkspaceIdRef.current = workspace.id;
		ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
	}, [ensureWorkspaceInSidebar, workspace]);

	const sshDiagnostics = useMemo(() => {
		if (!workspace || !sshHostId) {
			return null;
		}

		if (!sshStatus) {
			return {
				description: "Waiting for the SSH host connection to initialize.",
				title: `Resolving SSH host ${sshHost?.name ?? "connection"}`,
			};
		}

		if (sshStatus.state !== "ready") {
			const details =
				sshStatus.missingPrerequisites.length > 0
					? `Missing prerequisites: ${sshStatus.missingPrerequisites.join(", ")}`
					: (sshStatus.lastError ?? "Reconnect the SSH host to continue.");
			return {
				description: details,
				title: `SSH host ${sshHost?.name ?? workspace.deviceName ?? "connection"} is ${sshStatus.state}`,
			};
		}

		return null;
	}, [sshHost, sshHostId, sshStatus, workspace]);

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

	if (sshDiagnostics) {
		return (
			<div className="flex h-full items-center justify-center px-6">
				<div className="max-w-lg rounded-lg border border-border bg-card p-6">
					<h2 className="text-base font-semibold">{sshDiagnostics.title}</h2>
					<p className="mt-2 text-sm text-muted-foreground">
						{sshDiagnostics.description}
					</p>
				</div>
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
		>
			<Outlet />
		</WorkspaceTrpcProvider>
	);
}
