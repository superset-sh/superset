import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { projects, workspaces } from "../db/schema";
import { destroyWorkspace } from "../trpc/router/workspace-cleanup";
import type { HostServiceContext } from "../types";

/**
 * Finish crash-interrupted deletes. The destroy pipeline archives the row
 * first (mark-first commit point), so a crash mid-teardown leaves an
 * archived row whose worktree still exists on disk. The delete resumes with
 * best-effort teardown, but never with force: uncommitted files block it and
 * un-archive the row. A folder that may not be that worktree any more (made
 * after the delete, on another branch, or unreadable) is left alone.
 */
export async function runArchivedWorkspaceReconcile(
	ctx: HostServiceContext,
): Promise<void> {
	// A soft-deleted project keeps its workspaces' worktrees on disk so it
	// can be restored; those tombstones are not interrupted deletes.
	const archived = ctx.db
		.select({
			id: workspaces.id,
			worktreePath: workspaces.worktreePath,
			branch: workspaces.branch,
			archivedAt: workspaces.archivedAt,
		})
		.from(workspaces)
		.leftJoin(projects, eq(projects.id, workspaces.projectId))
		.where(and(isNotNull(workspaces.archivedAt), isNull(projects.deletedAt)))
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

	let resumed = 0;
	for (const row of stranded) {
		if (!isSameWorktree(row)) {
			console.warn(
				"[archived-workspace-reconcile] left a reused or unreadable folder alone",
				{ workspaceId: row.id, worktreePath: row.worktreePath },
			);
			continue;
		}
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
				// The folder may be a newer worktree that reused this path, so
				// uncommitted files block the delete and un-archive the row.
				force: false,
				teardownMode: "best-effort",
			});
			resumed++;
		} catch (err) {
			console.warn(
				"[archived-workspace-reconcile] failed to finish interrupted delete",
				{ workspaceId: row.id, worktreePath: row.worktreePath, err },
			);
		}
	}
	if (resumed > 0) {
		console.log(
			`[archived-workspace-reconcile] finished ${resumed} interrupted delete(s)`,
		);
	}
}

function isSameWorktree(row: {
	worktreePath: string;
	branch: string;
	archivedAt: number | null;
}): boolean {
	try {
		const createdAt = statSync(row.worktreePath).birthtimeMs;
		if (row.archivedAt !== null && createdAt > row.archivedAt) return false;
		return readCheckedOutBranch(row.worktreePath) === row.branch;
	} catch {
		return false;
	}
}

/** Reads HEAD from disk: no git process, so a cold start cannot time out. */
export function readCheckedOutBranch(worktreePath: string): string | null {
	const dotGit = join(worktreePath, ".git");
	let gitDir = dotGit;
	if (statSync(dotGit).isFile()) {
		const pointer = readFileSync(dotGit, "utf8").match(/^gitdir: (.+)$/m)?.[1];
		if (!pointer) return null;
		gitDir = isAbsolute(pointer) ? pointer : resolve(worktreePath, pointer);
	}
	const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
	return head.startsWith("ref: refs/heads/")
		? head.slice("ref: refs/heads/".length)
		: null;
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
