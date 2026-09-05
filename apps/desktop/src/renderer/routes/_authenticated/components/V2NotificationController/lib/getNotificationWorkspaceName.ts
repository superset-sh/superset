import { getWorkspaceDisplayName } from "shared/workspace-display-name";

interface NotificationWorkspaceNameSource {
	type: "main" | "worktree" | "session";
	name: string;
	branch: string;
}

export function getNotificationWorkspaceName(
	workspace: NotificationWorkspaceNameSource,
): string {
	return (
		getWorkspaceDisplayName({
			type: workspace.type,
			name: workspace.name.trim(),
			branch: workspace.branch.trim(),
		}) || "Workspace"
	);
}
