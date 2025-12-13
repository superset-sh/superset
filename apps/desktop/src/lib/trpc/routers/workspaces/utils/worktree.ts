import { db } from "main/lib/db";
import type { Workspace } from "main/lib/db/schemas";

/**
 * Gets the worktree path for a workspace by worktree ID
 * @deprecated Use getWorkspacePath() instead for type-aware path resolution
 */
export function getWorktreePath(worktreeId: string): string | undefined {
	const worktree = db.data.worktrees.find((w) => w.id === worktreeId);
	return worktree?.path;
}

/**
 * Gets the file path for a workspace, handling both worktree and branch types.
 * - For worktree type: returns the worktree path
 * - For branch type: returns the main repo path
 */
export function getWorkspacePath(workspace: Workspace): string | undefined {
	if (workspace.type === "branch") {
		const project = db.data.projects.find((p) => p.id === workspace.projectId);
		return project?.mainRepoPath;
	}
	// Worktree type - use worktree path
	if (workspace.worktreeId) {
		return getWorktreePath(workspace.worktreeId);
	}
	return undefined;
}

/**
 * Gets the file path for a workspace by ID
 */
export function getWorkspacePathById(workspaceId: string): string | undefined {
	const workspace = db.data.workspaces.find((w) => w.id === workspaceId);
	if (!workspace) return undefined;
	return getWorkspacePath(workspace);
}
