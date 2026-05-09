// V2 worktrees live at `<homedir>/.superset/worktrees/<projectId>/<branchAtCreation>`.
// The directory name is fixed at create time; `workspaces.branch` drifts as HEAD
// moves (git status sync, AI rename, manual checkout). Derive the label from the
// persisted path so it always matches the on-disk directory.
export function getV2WorktreeDisplayName(
	worktreePath: string,
	projectId: string,
): string {
	const marker = `worktrees/${projectId}/`;
	const idx = worktreePath.indexOf(marker);
	if (idx >= 0) {
		const tail = worktreePath.slice(idx + marker.length);
		if (tail.length > 0) return tail;
	}
	const lastSep = Math.max(
		worktreePath.lastIndexOf("/"),
		worktreePath.lastIndexOf("\\"),
	);
	return lastSep >= 0 ? worktreePath.slice(lastSep + 1) : worktreePath;
}
