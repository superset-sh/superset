import path from "node:path";
import {
	projects,
	type SelectWorkspace,
	workspaces,
	worktrees,
} from "@superset/local-db";
import { eq, isNull } from "drizzle-orm";
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
 * For branch workspaces: returns the main repo path
 */
export function getWorkspacePath(workspace: SelectWorkspace): string | null {
	if (workspace.type === "branch") {
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

/**
 * Finds a workspace whose filesystem path matches (or is a parent of) the given cwd.
 * Prefers the longest (most specific) match when multiple workspaces match.
 */
export function resolveWorkspaceByPath(cwd: string): SelectWorkspace | null {
	const allWorkspaces = localDb
		.select()
		.from(workspaces)
		.where(isNull(workspaces.deletingAt))
		.all();

	let bestMatch: SelectWorkspace | null = null;
	let bestMatchLength = 0;

	const normalizedCwd = path.resolve(cwd);

	for (const ws of allWorkspaces) {
		const wsPath = getWorkspacePath(ws);
		if (!wsPath) continue;

		const normalizedWsPath = path.resolve(wsPath);
		if (
			normalizedCwd === normalizedWsPath ||
			normalizedCwd.startsWith(`${normalizedWsPath}${path.sep}`)
		) {
			if (normalizedWsPath.length > bestMatchLength) {
				bestMatch = ws;
				bestMatchLength = normalizedWsPath.length;
			}
		}
	}

	return bestMatch;
}
