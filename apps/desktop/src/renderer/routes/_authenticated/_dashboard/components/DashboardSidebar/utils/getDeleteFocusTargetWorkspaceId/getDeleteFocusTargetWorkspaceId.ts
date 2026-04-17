export function getDeleteFocusTargetWorkspaceId(
	flattenedWorkspaceIds: readonly string[],
	deletedWorkspaceId: string,
): string | null {
	const index = flattenedWorkspaceIds.indexOf(deletedWorkspaceId);
	if (index === -1) return null;
	return (
		flattenedWorkspaceIds[index - 1] ?? flattenedWorkspaceIds[index + 1] ?? null
	);
}
