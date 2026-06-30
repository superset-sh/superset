export interface AutoAddWorkspaceCandidate {
	id: string;
	projectId: string;
}

/**
 * Decides which local workspaces need a `v2WorkspaceLocalState` row backfilled
 * into the sidebar. A workspace qualifies when it has no local-state row at all
 * ("never seen on this device" — e.g. CLI-created ones). Workspaces that already
 * have a row are left untouched, whether the row is visible (GUI-created) or a
 * `isHidden: true` tombstone (explicitly removed/unpinned) — `knownWorkspaceIds`
 * must include both so dismissed workspaces never get re-pinned.
 */
export function selectWorkspacesToAutoAdd(
	localWorkspaces: readonly AutoAddWorkspaceCandidate[],
	knownWorkspaceIds: Iterable<string>,
): AutoAddWorkspaceCandidate[] {
	const known = new Set(knownWorkspaceIds);
	return localWorkspaces.filter((workspace) => !known.has(workspace.id));
}
