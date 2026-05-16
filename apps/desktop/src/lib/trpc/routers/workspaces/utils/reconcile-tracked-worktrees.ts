import { workspaces, worktrees } from "@superset/local-db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import type { ExternalWorktree } from "./git";
import { getStaleTrackedWorktreeIds } from "./reconcile-tracked-worktrees-model";

interface ReconcileTrackedWorktreesArgs {
	projectId: string;
	liveWorktrees: ExternalWorktree[];
}

function getTrackedWorktreesForReconciliation(projectId: string) {
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
		return [];
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

	return projectWorktrees.map((worktree) => ({
		...worktree,
		hasActiveWorkspace: activeWorktreeIds.has(worktree.id),
	}));
}

export function getTrackedPathsExcludingStaleWorktrees({
	projectId,
	liveWorktrees,
}: ReconcileTrackedWorktreesArgs): Set<string> {
	const trackedWorktrees = getTrackedWorktreesForReconciliation(projectId);

	if (trackedWorktrees.length === 0) {
		return new Set();
	}

	const staleIds = getStaleTrackedWorktreeIds({
		trackedWorktrees,
		liveWorktrees,
	});
	const staleIdSet = new Set(staleIds);

	return new Set(
		trackedWorktrees
			.filter((worktree) => !staleIdSet.has(worktree.id))
			.map((worktree) => worktree.path),
	);
}

export function pruneStaleTrackedWorktrees({
	projectId,
	liveWorktrees,
}: ReconcileTrackedWorktreesArgs): void {
	const staleIds = getStaleTrackedWorktreeIds({
		trackedWorktrees: getTrackedWorktreesForReconciliation(projectId),
		liveWorktrees,
	});

	if (staleIds.length === 0) {
		return;
	}

	localDb.delete(worktrees).where(inArray(worktrees.id, staleIds)).run();
}
