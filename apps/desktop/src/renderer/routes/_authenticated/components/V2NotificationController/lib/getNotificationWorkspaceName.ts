import { getV2WorkspaceDisplayName } from "renderer/utils/getV2WorkspaceDisplayName";

interface NotificationWorkspaceNameSource {
	type: "local" | "worktree" | "session";
	name: string;
	branch: string;
}

export function getNotificationWorkspaceName(
	workspace: NotificationWorkspaceNameSource,
): string {
	return (
		getV2WorkspaceDisplayName({
			name: workspace.name.trim(),
			branch: workspace.branch.trim(),
		}) || "Workspace"
	);
}
