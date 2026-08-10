export type LocalWorkspaceForPlacement = {
	id: string;
	/** Null for project-less "session" workspaces (never auto-placed here). */
	projectId: string | null;
	type: "main" | "worktree" | "session";
};

/**
 * Chooses which of this device's workspaces the sidebar reconciler should
 * place. Kept free of React so it can be unit-tested directly.
 *
 * Only `worktree` workspaces are eligible: the host creates a `main` for every
 * project on the device, so placing those would drag locally-known projects the
 * user never added into the sidebar. Main workspaces surface instead via the
 * gated `isAutoIncludedLocalMainWorkspace` path. A workspace that already has a
 * local-state row is "already placed" and skipped, so nothing the user has
 * moved, hidden, or removed is re-added.
 */
export function selectWorktreesToPlace(
	localWorkspaces: readonly LocalWorkspaceForPlacement[],
	placedWorkspaceIds: ReadonlySet<string>,
): Array<{ id: string; projectId: string }> {
	return localWorkspaces.flatMap((workspace) => {
		if (
			workspace.type !== "worktree" ||
			workspace.projectId === null ||
			placedWorkspaceIds.has(workspace.id)
		) {
			return [];
		}
		return [{ id: workspace.id, projectId: workspace.projectId }];
	});
}
