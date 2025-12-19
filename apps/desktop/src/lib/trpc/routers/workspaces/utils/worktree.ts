import { db } from "main/lib/db";
import type { Workspace } from "main/lib/db/schemas";

/**
 * Gets the worktree path for a workspace by worktreeId
 */
export function getWorktreePath(worktreeId: string): string | undefined {
	const worktree = db.data.worktrees.find((w) => w.id === worktreeId);
	return worktree?.path;
}

/**
 * Gets the working directory path for a workspace.
 * For worktree workspaces: returns the worktree path
 * For branch workspaces: returns the main repo path
 */
export function getWorkspacePath(workspace: Workspace): string | null {
	if (workspace.type === "branch") {
		const project = db.data.projects.find((p) => p.id === workspace.projectId);
		return project?.mainRepoPath ?? null;
	}

	// For worktree type, use worktree path
	if (workspace.worktreeId) {
		const worktree = db.data.worktrees.find(
			(wt) => wt.id === workspace.worktreeId,
		);
		return worktree?.path ?? null;
	}

	return null;
}
