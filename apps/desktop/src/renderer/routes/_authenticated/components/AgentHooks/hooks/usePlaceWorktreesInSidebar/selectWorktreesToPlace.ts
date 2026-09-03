export type LocalWorkspaceForPlacement = {
	id: string;
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	type: "main" | "worktree" | "session";
};

/**
 * Chooses which of this device's workspaces the sidebar reconciler should
 * place. Kept free of React so it can be unit-tested directly.
 *
 * `worktree` and `session` workspaces are eligible: both are always explicit
 * creations (renderer, CLI, or automation), so they surface even when created
 * outside the renderer. `main` workspaces are not — the host creates one for
 * every project on the device, so placing those would drag locally-known
 * projects the user never added into the sidebar; they surface instead via the
 * gated `isAutoIncludedLocalMainWorkspace` path. A workspace that already has a
 * local-state row is "already placed" and skipped, so nothing the user has
 * moved, hidden, or removed is re-added.
 */
export function selectWorktreesToPlace(
	localWorkspaces: readonly LocalWorkspaceForPlacement[],
	placedWorkspaceIds: ReadonlySet<string>,
): Array<{ id: string; projectId: string | null }> {
	return localWorkspaces.flatMap(
		(workspace): Array<{ id: string; projectId: string | null }> => {
			if (placedWorkspaceIds.has(workspace.id)) return [];
			if (workspace.type === "worktree" && workspace.projectId !== null) {
				return [{ id: workspace.id, projectId: workspace.projectId }];
			}
			// Sessions are project-less; they land in the top-level Sessions
			// section, so placement carries no project.
			if (workspace.type === "session") {
				return [{ id: workspace.id, projectId: null }];
			}
			return [];
		},
	);
}
