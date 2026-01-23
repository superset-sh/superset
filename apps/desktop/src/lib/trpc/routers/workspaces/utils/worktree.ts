import { projects, type SelectWorkspace, worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";

/**
 * Gets the worktree path for a workspace by worktreeId
 */
export function getWorktreePath(worktreeId: string): string | undefined {
	const worktree = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.id, worktreeId))
		.get();
	return worktree?.path;
}

/**
 * Gets the working directory path for a workspace.
 * For worktree workspaces: returns the worktree path
 * For branch/cloud workspaces: returns the main repo path
 */
export function getWorkspacePath(workspace: SelectWorkspace): string | null {
	if (workspace.type === "branch" || workspace.type === "cloud") {
		const project = localDb
			.select()
			.from(projects)
			.where(eq(projects.id, workspace.projectId))
			.get();
		return project?.mainRepoPath ?? null;
	}

	// For worktree type, use worktree path
	if (workspace.worktreeId) {
		const worktree = localDb
			.select()
			.from(worktrees)
			.where(eq(worktrees.id, workspace.worktreeId))
			.get();
		return worktree?.path ?? null;
	}

	return null;
}
