import { existsSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { workspaces } from "../db/schema";
import { destroyWorkspace } from "../trpc/router/workspace-cleanup";
import type { HostServiceContext } from "../types";
import { notTombstoned, tombstoned } from "../workspaces/archive-state";

/**
 * Finish crash-interrupted deletes. The destroy pipeline tombstones the row
 * first (mark-first commit point), so a crash mid-teardown leaves a
 * tombstoned row whose worktree still exists on disk. The user's delete
 * intent is durably recorded — resume it with best-effort teardown rather
 * than blocking forever on a broken teardown script. A failure here
 * revives the row (destroy semantics), making the workspace visible and
 * retryable instead of leaving orphan disk state invisible.
 *
 * Only tombstones (reason "merged" | "deleted") qualify. A row the user
 * archived shares the columns but keeps its worktree on purpose; it is a
 * live owner of its path here, never a stranded delete.
 */
export async function runArchivedWorkspaceReconcile(
	ctx: HostServiceContext,
): Promise<void> {
	const archived = ctx.db
		.select({ id: workspaces.id, worktreePath: workspaces.worktreePath })
		.from(workspaces)
		.where(tombstoned)
		.all();
	if (archived.length === 0) return;

	const livePaths = new Set(
		ctx.db
			.select({ worktreePath: workspaces.worktreePath })
			.from(workspaces)
			.where(notTombstoned)
			.all()
			.map((row) => row.worktreePath),
	);

	const stranded = selectStranded(archived, livePaths, existsSync);

	for (const row of stranded) {
		// Re-check ownership at destroy time: a workspace re-created on the
		// same branch can claim this path between the snapshot above and now.
		const liveOwner = ctx.db
			.select({ id: workspaces.id })
			.from(workspaces)
			.where(and(notTombstoned, eq(workspaces.worktreePath, row.worktreePath)))
			.get();
		if (liveOwner) continue;
		try {
			await destroyWorkspace(ctx, {
				workspaceId: row.id,
				deleteBranch: false,
				force: true,
				teardownMode: "best-effort",
			});
		} catch (err) {
			console.warn(
				"[archived-workspace-reconcile] failed to finish interrupted delete",
				{ workspaceId: row.id, worktreePath: row.worktreePath, err },
			);
		}
	}
	if (stranded.length > 0) {
		console.log(
			`[archived-workspace-reconcile] resumed ${stranded.length} interrupted delete(s)`,
		);
	}
}

/**
 * A tombstone is stranded (delete was interrupted) only when its worktree
 * still exists on disk AND no live row owns that path — a tombstone's path
 * can be legitimately reused by a re-created workspace on the same branch,
 * and touching it would destroy a healthy worktree.
 */
export function selectStranded<T extends { worktreePath: string }>(
	archived: T[],
	livePaths: ReadonlySet<string>,
	exists: (path: string) => boolean,
): T[] {
	return archived.filter(
		(row) => !livePaths.has(row.worktreePath) && exists(row.worktreePath),
	);
}
