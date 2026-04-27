import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "../../../../../providers/CollectionsProvider";
import { useLocalHostService } from "../../../../../providers/LocalHostServiceProvider";
import { V2OpenInMenuButton } from "../V2OpenInMenuButton";

interface V2WorkspaceOpenInButtonProps {
	workspaceId: string;
}

export function V2WorkspaceOpenInButton({
	workspaceId,
}: V2WorkspaceOpenInButtonProps) {
	const collections = useCollections();
	const { machineId, activeHostUrl } = useLocalHostService();

	const { data: workspacesWithHost = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.leftJoin({ hosts: collections.v2Hosts }, ({ workspaces, hosts }) =>
					eq(workspaces.hostId, hosts.machineId),
				)
				.where(({ workspaces }) => eq(workspaces.id, workspaceId))
				.select(({ workspaces, hosts }) => ({
					id: workspaces.id,
					branch: workspaces.branch,
					projectId: workspaces.projectId,
					hostMachineId: hosts?.machineId ?? null,
				})),
		[collections, workspaceId],
	);
	const workspace = workspacesWithHost[0] ?? null;
	const isLocalWorkspace =
		Boolean(workspace) && workspace.hostMachineId === machineId;

	const workspaceQuery = useQuery({
		queryKey: ["v2-open-in-workspace", activeHostUrl, workspaceId],
		queryFn: () =>
			getHostServiceClientByUrl(activeHostUrl as string).workspace.get.query({
				id: workspaceId,
			}),
		enabled: !!workspace && !!activeHostUrl && isLocalWorkspace,
	});

	if (!workspace || !activeHostUrl || !isLocalWorkspace) {
		return null;
	}

	if (!workspaceQuery.data?.worktreePath) {
		return null;
	}

	return (
		<V2OpenInMenuButton
			branch={workspace.branch}
			worktreePath={workspaceQuery.data.worktreePath}
			projectId={workspace.projectId}
		/>
	);
}
