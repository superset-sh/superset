import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMatchRoute } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getWorkspaceDisplayName } from "renderer/lib/getWorkspaceDisplayName";
import { getWorkspaceHostUrlForWorkspace } from "renderer/lib/v2-workspace-host";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostService } from "renderer/routes/_authenticated/providers/HostServiceProvider/HostServiceProvider";

type TopBarOpenInState =
	| {
			kind: "v1";
			branch?: string;
			projectId?: string;
			worktreePath: string;
	  }
	| {
			kind: "v2";
			branch: string;
			hostUrl: string;
			projectId: string;
			workspaceId: string;
	  };

export interface CurrentWorkspaceForTopBar {
	openIn: TopBarOpenInState | null;
	workspaceId: string | null;
	workspaceName?: string;
}

export function useCurrentWorkspaceForTopBar(): CurrentWorkspaceForTopBar {
	const matchRoute = useMatchRoute();
	const collections = useCollections();
	const { services } = useHostService();

	const v1Match = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const v2Match = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});

	const v1WorkspaceId = v1Match !== false ? v1Match.workspaceId : null;
	const v2WorkspaceId = v2Match !== false ? v2Match.workspaceId : null;
	const isV2WorkspaceRoute = v2WorkspaceId !== null;

	const { data: v1Workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: v1WorkspaceId ?? "" },
		{ enabled: Boolean(v1WorkspaceId) && !isV2WorkspaceRoute },
	);
	const { data: deviceInfo, isPending: isDeviceInfoPending } =
		electronTrpc.auth.getDeviceInfo.useQuery(undefined, {
			enabled: isV2WorkspaceRoute,
		});

	const { data: v2Workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.where(({ v2Workspaces }) => eq(v2Workspaces.id, v2WorkspaceId ?? "")),
		[collections, v2WorkspaceId],
	);
	const v2Workspace = v2Workspaces[0] ?? null;

	const { data: currentDevices = [] } = useLiveQuery(
		(q) =>
			q
				.from({ v2Devices: collections.v2Devices })
				.where(({ v2Devices }) =>
					and(
						eq(v2Devices.clientId, deviceInfo?.deviceId ?? ""),
						eq(v2Devices.organizationId, v2Workspace?.organizationId ?? ""),
					),
				),
		[collections, deviceInfo?.deviceId, v2Workspace?.organizationId],
	);
	const currentDevice = currentDevices[0] ?? null;

	if (isV2WorkspaceRoute) {
		const localHostUrl = v2Workspace
			? (services.get(v2Workspace.organizationId)?.url ?? null)
			: null;
		const shouldWaitForDeviceInfo = v2Workspace !== null && isDeviceInfoPending;
		const hostUrl =
			!v2Workspace || shouldWaitForDeviceInfo
				? null
				: v2Workspace.deviceId === currentDevice?.id
					? localHostUrl
					: getWorkspaceHostUrlForWorkspace(v2Workspace.id);

		return {
			openIn:
				v2Workspace && hostUrl
					? {
							kind: "v2",
							branch: v2Workspace.branch,
							hostUrl,
							projectId: v2Workspace.projectId,
							workspaceId: v2Workspace.id,
						}
					: null,
			workspaceId: v2WorkspaceId,
			workspaceName: v2Workspace?.name,
		};
	}

	return {
		openIn: v1Workspace?.worktreePath
			? {
					kind: "v1",
					branch: v1Workspace.worktree?.branch,
					projectId: v1Workspace.project?.id,
					worktreePath: v1Workspace.worktreePath,
				}
			: null,
		workspaceId: v1WorkspaceId,
		workspaceName: v1Workspace
			? getWorkspaceDisplayName(
					v1Workspace.name,
					v1Workspace.type,
					v1Workspace.project?.name,
				)
			: undefined,
	};
}
