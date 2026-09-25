import { getWorkspaceDisplayName } from "renderer/utils/getWorkspaceDisplayName";

interface NotificationWorkspaceNameSource {
	type: "local" | "worktree" | "session";
	name: string;
	branch: string;
}

export function getNotificationWorkspaceName(
	workspace: NotificationWorkspaceNameSource,
): string {
	return (
		getWorkspaceDisplayName({
			name: workspace.name.trim(),
			branch: workspace.branch.trim(),
		}) || "Workspace"
	);
}
