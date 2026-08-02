export function workspaceIdsForSectionMove(
	workspaceIds: readonly string[],
	sectionByWorkspaceId: ReadonlyMap<string, string>,
	targetSectionId: string | null,
): string[] {
	return workspaceIds.filter(
		(workspaceId) =>
			(sectionByWorkspaceId.get(workspaceId) ?? null) !== targetSectionId,
	);
}
