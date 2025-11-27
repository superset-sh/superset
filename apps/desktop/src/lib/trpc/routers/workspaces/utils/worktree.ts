import { db } from "main/lib/db";

/**
 * Gets the worktree path for a workspace
 */
export function getWorktreePath(worktreeId: string): string | undefined {
	const worktree = db.data.worktrees.find((w) => w.id === worktreeId);
	return worktree?.path;
}
