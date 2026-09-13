import { TRPCError } from "@trpc/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import {
	type CloudShapedWorkspace,
	getLocalWorkspace,
	toCloudShape,
	unarchiveLocalWorkspace,
	updateLocalWorkspace,
} from "../../../workspaces/local-workspace-store";
import { protectedProcedure } from "../../index";
import {
	requireLocalProject,
	requireProjectRepoPath,
} from "../workspace-creation/shared/local-project";
import { startSetupTerminalIfPresent } from "../workspace-creation/shared/setup-terminal";
import { parseSparseCheckoutPaths } from "../workspace-creation/shared/sparse-checkout";
import { cleanupGitOps } from "./git-ops";

export interface ReviveWorkspaceResult {
	workspace: CloudShapedWorkspace;
	warnings: string[];
}

/**
 * Bring a destroyed workspace back: the destroy tombstoned its row and
 * removed its worktree, but the branch is still there, so the worktree is
 * checked out again at the tombstone's own path and the row goes live
 * again. Agents keep their conversations keyed by working directory, so the
 * same path is what brings the chats back with it.
 *
 * The worktree is recreated before the row is un-archived: a live row with
 * no worktree behind it is the one state nothing here knows how to show.
 */
export const revive = protectedProcedure
	.input(z.object({ workspaceId: z.string() }))
	.mutation(({ ctx, input }) => reviveWorkspace(ctx, input.workspaceId));

export async function reviveWorkspace(
	ctx: HostServiceContext,
	workspaceId: string,
): Promise<ReviveWorkspaceResult> {
	const { __testDestroysInFlight: workspaceLifecycleInFlight } = await import(
		"./workspace-cleanup"
	);
	if (workspaceLifecycleInFlight.has(workspaceId)) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Workspace lifecycle operation already in progress",
		});
	}
	workspaceLifecycleInFlight.add(workspaceId);
	try {
		return await runRevive(ctx, workspaceId);
	} finally {
		workspaceLifecycleInFlight.delete(workspaceId);
	}
}

async function runRevive(
	ctx: HostServiceContext,
	workspaceId: string,
): Promise<ReviveWorkspaceResult> {
	const row = getLocalWorkspace(ctx.db, workspaceId);
	if (!row || row.archivedAt == null) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Archived workspace not found",
		});
	}
	// Only an archive is a promise to come back; a delete — including a
	// delete of an archived workspace — is final.
	if (row.archiveReason !== "archived") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "This workspace was deleted, so it cannot be restored",
		});
	}
	if (row.type !== "worktree" || !row.projectId || !row.branch) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Only worktree workspaces can be restored",
		});
	}
	const localProject = requireLocalProject(ctx, row.projectId);
	const repoPath = requireProjectRepoPath(localProject);

	const live = ctx.db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(
			and(
				eq(workspaces.projectId, row.projectId),
				isNull(workspaces.archivedAt),
				or(
					eq(workspaces.worktreePath, row.worktreePath),
					eq(workspaces.branch, row.branch),
				),
			),
		)
		.get();
	if (live) {
		throw new TRPCError({
			code: "CONFLICT",
			message: `"${row.branch}" is already open in another workspace`,
		});
	}

	const gitEnv = await cleanupGitOps.resolveGitEnv(ctx, repoPath);
	const result = await cleanupGitOps.reviveWorktree({
		repoPath,
		worktreePath: row.worktreePath,
		archivedBranch: row.branch,
		remote: localProject.remoteName ?? "origin",
		sparsePaths: parseSparseCheckoutPaths(localProject.sparseCheckoutPaths),
		gitEnv,
	});
	if (!result.ok) {
		throw new TRPCError({ code: result.code, message: result.message });
	}
	const { branch } = result;

	const liveOwner = ctx.db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(
			and(
				eq(workspaces.projectId, row.projectId),
				isNull(workspaces.archivedAt),
				or(
					eq(workspaces.worktreePath, row.worktreePath),
					eq(workspaces.branch, branch),
				),
			),
		)
		.get();
	if (liveOwner) {
		throw new TRPCError({
			code: "CONFLICT",
			message: `"${branch}" is already open in another workspace`,
		});
	}

	if (branch !== row.branch) {
		updateLocalWorkspace(ctx, workspaceId, { branch });
	}
	unarchiveLocalWorkspace(ctx, workspaceId);

	const warnings: string[] = [];
	const setup = await startSetupTerminalIfPresent({ ctx, workspaceId });
	if (setup.warning) warnings.push(setup.warning);

	const restored = getLocalWorkspace(ctx.db, workspaceId);
	if (!restored) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workspace disappeared while it was being restored",
		});
	}
	return {
		workspace: toCloudShape(restored, ctx.organizationId),
		warnings,
	};
}
