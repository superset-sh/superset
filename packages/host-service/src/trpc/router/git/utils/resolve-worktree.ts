import { existsSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import { findWorkspaceRepo } from "../../../../workspaces/workspace-repos";
import type { protectedProcedure } from "../../../index";

type ProcedureCtx = Parameters<
	Parameters<typeof protectedProcedure.query>[0]
>[0]["ctx"];

export interface WorktreeTarget {
	worktreePath: string;
	/** Cache-partition key for the repo; empty string for the primary. */
	repoKey: string;
}

/**
 * The worktree a `git.*` call operates in. `repo` names a folder (or a
 * `workspace_repos` id) inside the workspace; omitting it means the primary.
 */
export function resolveWorktreeTarget(
	ctx: ProcedureCtx,
	workspaceId: string,
	repo?: string | null,
): WorktreeTarget {
	const workspace = ctx.db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	if (!workspace?.worktreePath) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workspace not found",
		});
	}

	let worktreePath = workspace.worktreePath;
	let repoKey = "";
	if (repo != null && repo !== "") {
		const match = findWorkspaceRepo(ctx.db, workspaceId, repo);
		if (!match) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `Workspace has no repo "${repo}"`,
			});
		}
		worktreePath = match.worktreePath;
		repoKey = match.folder;
	}

	// A worktree deleted outside the app is a routine lifecycle state, not a
	// bug — classify it here so simple-git's construct error can't escape any
	// git.* procedure as a reportable 500.
	if (!existsSync(worktreePath)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Worktree no longer exists on disk",
			cause: { kind: "WORKTREE_MISSING", worktreePath },
		});
	}
	return { worktreePath, repoKey };
}

export function resolveWorktreePath(
	ctx: ProcedureCtx,
	workspaceId: string,
	repo?: string | null,
): string {
	return resolveWorktreeTarget(ctx, workspaceId, repo).worktreePath;
}
