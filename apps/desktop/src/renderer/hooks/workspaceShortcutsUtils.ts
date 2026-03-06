type WorkspaceGroup = {
	project: { id: string };
	workspaces: Array<{ id: string }>;
};

export function getUncollapsedWorkspaces(
	groups: WorkspaceGroup[],
	collapsedProjectIds: string[],
): Array<{ id: string }> {
	return groups
		.filter((group) => !collapsedProjectIds.includes(group.project.id))
		.flatMap((group) => group.workspaces);
}
