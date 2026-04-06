import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "../../../../../providers/CollectionsProvider";
import { useHostService } from "../../../../../providers/HostServiceProvider/HostServiceProvider";
import { V2OpenInMenuButton } from "../V2OpenInMenuButton";

interface V2WorkspaceOpenInButtonProps {
	workspaceId: string;
}

export function V2WorkspaceOpenInButton({
	workspaceId,
}: V2WorkspaceOpenInButtonProps) {
	const collections = useCollections();
	const { services } = useHostService();
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();
	const { data: workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) => eq(workspaces.id, workspaceId)),
		[collections, workspaceId],
	);
	const workspace = workspaces[0] ?? null;
	const { data: currentDevices = [] } = useLiveQuery(
		(q) =>
			q
				.from({ devices: collections.v2Devices })
				.where(({ devices }) =>
					and(
						eq(devices.clientId, deviceInfo?.deviceId ?? ""),
						eq(devices.organizationId, workspace?.organizationId ?? ""),
					),
				),
		[collections, deviceInfo?.deviceId, workspace?.organizationId],
	);
	const currentDevice = currentDevices[0] ?? null;
	const hostUrl = workspace
		? (services.get(workspace.organizationId)?.url ?? null)
		: null;
	const isLocalWorkspace =
		Boolean(workspace) && workspace.deviceId === currentDevice?.id;

	const workspaceQuery = useQuery({
		queryKey: ["v2-open-in-workspace", hostUrl, workspaceId],
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl as string).workspace.get.query({
				id: workspaceId,
			}),
		enabled: !!workspace && !!hostUrl && isLocalWorkspace,
	});

	if (!workspace || !hostUrl || !isLocalWorkspace) {
		return null;
	}

	if (!workspaceQuery.data?.worktreePath) {
		return null;
	}

	return (
		<V2OpenInMenuButton
			branch={workspace.branch}
			worktreePath={workspaceQuery.data.worktreePath}
			workspaceId={workspace.id}
		/>
	);
}
