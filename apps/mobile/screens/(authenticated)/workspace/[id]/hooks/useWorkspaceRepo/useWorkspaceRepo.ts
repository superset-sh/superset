import { useHostProjects } from "@/hooks/useHostProjects";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";

/**
 * The GitHub coordinates behind a workspace. Projects are local to the host, so
 * the owner and repo come from the project rather than from anything cloud-side.
 */
export function useWorkspaceRepo(workspaceId: string | null): {
	owner: string | null;
	repo: string | null;
} {
	const { workspace, host } = useWorkspaceHost(workspaceId);
	const { projects } = useHostProjects(
		host
			? {
					organizationId: host.organizationId,
					machineId: host.machineId,
					isOnline: host.isOnline,
				}
			: null,
	);
	const project = workspace
		? projects.find((item) => item.id === workspace.projectId)
		: undefined;
	return {
		owner: project?.repoOwner ?? null,
		repo: project?.repoName ?? null,
	};
}
