import type { ExternalApp } from "@superset/local-db";
import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostService } from "renderer/routes/_authenticated/providers/HostServiceProvider/HostServiceProvider";
import { OpenInMenuButton } from "../OpenInMenuButton";

interface WorkspaceOpenInButtonProps {
	v1WorkspaceId: string | null;
	v2WorkspaceId: string | null;
}

export function WorkspaceOpenInButton({
	v1WorkspaceId,
	v2WorkspaceId,
}: WorkspaceOpenInButtonProps) {
	if (v2WorkspaceId) {
		return <V2Inner workspaceId={v2WorkspaceId} />;
	}
	if (v1WorkspaceId) {
		return <V1Inner workspaceId={v1WorkspaceId} />;
	}
	return null;
}

function V1Inner({ workspaceId }: { workspaceId: string }) {
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);

	if (!workspace?.worktreePath) return null;

	return (
		<OpenInMenuButton
			worktreePath={workspace.worktreePath}
			branch={workspace.worktree?.branch}
			projectId={workspace.project?.id}
		/>
	);
}

function V2Inner({ workspaceId }: { workspaceId: string }) {
	const collections = useCollections();
	const { services } = useHostService();
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();

	const localState = collections.v2WorkspaceLocalState.get(workspaceId);
	const [defaultApp, setDefaultApp] = useState<ExternalApp | null>(
		(localState?.defaultOpenInApp as ExternalApp) ?? null,
	);

	const handleDefaultAppChange = useCallback(
		(app: ExternalApp) => {
			setDefaultApp(app);
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.defaultOpenInApp = app;
			});
		},
		[collections, workspaceId],
	);

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
			getHostServiceClientByUrl(hostUrl!).workspace.get.query({
				id: workspaceId,
			}),
		enabled: !!workspace && !!hostUrl && isLocalWorkspace,
	});

	if (!workspace || !hostUrl || !isLocalWorkspace) return null;
	if (!workspaceQuery.data?.worktreePath) return null;

	return (
		<OpenInMenuButton
			branch={workspace.branch}
			worktreePath={workspaceQuery.data.worktreePath}
			defaultAppOverride={defaultApp}
			onDefaultAppChange={handleDefaultAppChange}
		/>
	);
}
