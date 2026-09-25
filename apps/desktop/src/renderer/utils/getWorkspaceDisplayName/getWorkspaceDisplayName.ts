interface WorkspaceNameSource {
	name: string;
	branch: string;
}

export function getWorkspaceDisplayName(
	workspace: WorkspaceNameSource,
): string {
	return workspace.name || workspace.branch;
}
