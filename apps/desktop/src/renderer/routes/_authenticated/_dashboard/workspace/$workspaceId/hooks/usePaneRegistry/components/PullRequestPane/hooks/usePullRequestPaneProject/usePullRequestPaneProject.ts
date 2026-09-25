import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useProjectHost } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectHost";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/workspace/providers/WorkspaceProvider";

export function usePullRequestPaneProject(explicitProjectId?: string) {
	const { workspace, hostUrl: workspaceHostUrl } = useWorkspace();
	const projectId = explicitProjectId ?? workspace.projectId;
	const isWorkspaceProject = projectId === workspace.projectId;
	const target = useProjectHost(isWorkspaceProject ? null : projectId);
	const targetHostUrl = useHostUrl(target.hostId ?? undefined);
	return {
		workspace,
		projectId,
		isWorkspaceProject,
		hostId: isWorkspaceProject ? workspace.hostId : target.hostId,
		hostUrl: isWorkspaceProject ? workspaceHostUrl : targetHostUrl,
		isReady: isWorkspaceProject || target.isReady,
		hasProject: isWorkspaceProject
			? workspace.type !== "session"
			: !!target.project,
	};
}
