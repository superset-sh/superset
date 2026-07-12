interface V2WorkspaceNameSource {
	type: "main" | "worktree";
	name: string;
	branch: string;
}

/**
 * Main workspaces are the repo checkout itself — their stored name tracks the
 * checked-out branch rather than a user-chosen label, so they always display
 * as "local".
 */
export function getV2WorkspaceDisplayName(
	workspace: V2WorkspaceNameSource,
): string {
	if (workspace.type === "main") return "local";
	return workspace.name || workspace.branch;
}
