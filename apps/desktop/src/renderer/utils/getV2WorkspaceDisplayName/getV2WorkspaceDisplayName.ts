interface V2WorkspaceNameSource {
	name: string;
	branch: string;
}

export function getV2WorkspaceDisplayName(
	workspace: V2WorkspaceNameSource,
): string {
	return workspace.name || workspace.branch;
}
