export function getWorkspaceDisplayName(
	workspaceName: string,
	workspaceType: "worktree" | "branch",
	projectName?: string | null,
): string {
	return [projectName, workspaceType === "branch" ? "local" : workspaceName]
		.filter(Boolean)
		.join(" - ");
}
