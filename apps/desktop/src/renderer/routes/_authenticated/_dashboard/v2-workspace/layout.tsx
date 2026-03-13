import { eq, useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { env } from "renderer/env.renderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostService } from "renderer/routes/_authenticated/providers/HostServiceProvider";
import { WorkspaceTrpcProvider } from "./providers/WorkspaceTrpcProvider";

export const Route = createFileRoute("/_authenticated/_dashboard/v2-workspace")(
	{
		component: V2WorkspaceLayout,
	},
);

function getExternalWorkspaceHostUrl(workspaceId: string): string {
	// Placeholder until external-device host calls are proxied through the API.
	return `${env.NEXT_PUBLIC_API_URL}/api/v2-workspaces/${workspaceId}/host`;
}

function V2WorkspaceLayout() {
	const matchRoute = useMatchRoute();
	const workspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
	});
	const workspaceId =
		workspaceMatch !== false ? workspaceMatch.workspaceId : null;
	const collections = useCollections();
	const { services } = useHostService();
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
	const localHostService = workspace
		? (services.get(workspace.organizationId) ?? null)
		: null;
	const isExternalWorkspace =
		!!workspace?.deviceId &&
		!!deviceInfo?.deviceId &&
		workspace.deviceId !== deviceInfo.deviceId;
	const hostUrl = workspace
		? isExternalWorkspace
			? getExternalWorkspaceHostUrl(workspace.id)
			: (localHostService?.url ?? null)
		: null;

	if (!workspaceId || !workspace) {
		return <Outlet />;
	}

	if (workspace.deviceId && isDeviceInfoPending) {
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
		>
			<Outlet />
		</WorkspaceTrpcProvider>
	);
}
