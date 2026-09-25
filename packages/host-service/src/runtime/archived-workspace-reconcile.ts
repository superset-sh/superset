import { existsSync } from "node:fs";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { workspaces } from "../db/schema";
import { destroyWorkspace } from "../trpc/router/workspace-cleanup";
import type { HostServiceContext } from "../types";

/**
 * Finish crash-interrupted deletes. The destroy pipeline archives the row
 * first (mark-first commit point), so a crash mid-teardown leaves an
 * archived row whose worktree still exists on disk. The user's delete
 * intent is durably recorded — resume it with best-effort teardown rather
 * than blocking forever on a broken teardown script. A failure here
 * un-archives the row (destroy semantics), making the workspace visible
 * and retryable instead of leaving orphan disk state invisible.
 */
export async function runArchivedWorkspaceReconcile(
	ctx: HostServiceContext,
): Promise<void> {
	const archived = ctx.db
		.select({ id: workspaces.id, worktreePath: workspaces.worktreePath })
		.from(workspaces)
		.where(isNotNull(workspaces.archivedAt))
		.all();
	if (archived.length === 0) return;

	const livePaths = new Set(
		ctx.db
			.select({ worktreePath: workspaces.worktreePath })
			.from(workspaces)
			.where(isNull(workspaces.archivedAt))
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
			.where(
				and(
					isNull(workspaces.archivedAt),
					eq(workspaces.worktreePath, row.worktreePath),
				),
			)
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
