import { workspaces, worktrees } from "@superset/local-db";
import { and, eq, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import type { ExternalWorktree } from "./git";
import { getStaleTrackedWorktreeIds } from "./reconcile-tracked-worktrees-model";

export function pruneStaleTrackedWorktrees({
	projectId,
	liveWorktrees,
}: {
	projectId: string;
	liveWorktrees: ExternalWorktree[];
}): void {
	const projectWorktrees = localDb
		.select({
			id: worktrees.id,
			path: worktrees.path,
			branch: worktrees.branch,
		})
		.from(worktrees)
		.where(eq(worktrees.projectId, projectId))
		.all();

	if (projectWorktrees.length === 0) {
		return;
	}

	const activeWorkspaceRows = localDb
		.select({ worktreeId: workspaces.worktreeId })
		.from(workspaces)
		.where(
			and(eq(workspaces.projectId, projectId), isNull(workspaces.deletingAt)),
		)
		.all();
	const activeWorktreeIds = new Set(
		activeWorkspaceRows
			.map((workspace) => workspace.worktreeId)
			.filter((worktreeId): worktreeId is string => Boolean(worktreeId)),
	);

	const staleIds = getStaleTrackedWorktreeIds({
		trackedWorktrees: projectWorktrees.map((worktree) => ({
			...worktree,
			hasActiveWorkspace: activeWorktreeIds.has(worktree.id),
		})),
		liveWorktrees,
	});

	for (const worktreeId of staleIds) {
		localDb.delete(worktrees).where(eq(worktrees.id, worktreeId)).run();
	}
}
