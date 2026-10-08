import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface WorkspaceOpenInTarget {
	branch: string;
	worktreePath: string;
	projectId: string | null;
}

export function useWorkspaceOpenInTarget(
	workspaceId: string,
): WorkspaceOpenInTarget | null {
	const { machineId, activeHostUrl } = useLocalHostService();

	const { workspaces } = useHostWorkspaces();
	const workspace = workspaces.find((w) => w.id === workspaceId) ?? null;
	const isLocalWorkspace = workspace !== null && workspace.hostId === machineId;

	const workspaceQuery = useQuery({
		queryKey: ["v2-open-in-workspace", activeHostUrl, workspaceId],
		queryFn: () =>
			getHostServiceClientByUrl(activeHostUrl as string).workspace.get.query({
				id: workspaceId,
			}),
		enabled: !!workspace && !!activeHostUrl && isLocalWorkspace,
	});

	const worktreePath = workspaceQuery.data?.worktreePath;
	if (!workspace || !activeHostUrl || !isLocalWorkspace || !worktreePath) {
		return null;
	}

	return {
		branch: workspace.branch,
		worktreePath,
		projectId: workspace.projectId,
	};
}
