export function getWorkspaceDisplayName(
	workspaceName: string,
	workspaceType: "worktree" | "branch" | "remote",
	projectName?: string | null,
): string {
	if (workspaceType === "remote") {
		return [projectName, workspaceName || "remote"].filter(Boolean).join(" - ");
	}
	return [projectName, workspaceType === "branch" ? "local" : workspaceName]
		.filter(Boolean)
		.join(" - ");
}
