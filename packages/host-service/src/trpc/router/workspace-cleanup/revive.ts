import { lstatSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../db/schema";
import { resolveRef } from "../../../runtime/git/refs";
import type { HostServiceContext } from "../../../types";
import {
	type CloudShapedWorkspace,
	getLocalWorkspace,
	toCloudShape,
	unarchiveLocalWorkspace,
	updateLocalWorkspace,
} from "../../../workspaces/local-workspace-store";
import { protectedProcedure } from "../../index";
import { listWorktreeBranches } from "../workspace-creation/shared/branch-search";
import { enablePushAutoSetupRemote } from "../workspace-creation/shared/git-config";
import {
	requireLocalProject,
	requireProjectRepoPath,
} from "../workspace-creation/shared/local-project";
import { startSetupTerminalIfPresent } from "../workspace-creation/shared/setup-terminal";
import { parseSparseCheckoutPaths } from "../workspace-creation/shared/sparse-checkout";
import { addBranchWorktree } from "../workspaces/workspaces";

const revivesInFlight = new Set<string>();

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
	if (revivesInFlight.has(workspaceId)) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Restore already in progress for this workspace",
		});
	}
	revivesInFlight.add(workspaceId);
	try {
		return await runRevive(ctx, workspaceId);
	} finally {
		revivesInFlight.delete(workspaceId);
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

	const git = await ctx.git(repoPath);
	await git
		.raw(["worktree", "prune"])
		.catch((err) =>
			console.warn("[workspace-cleanup.revive] worktree prune failed:", err),
		);

	const resolved = await resolveRef(git, row.branch, {
		remote: localProject.remoteName ?? "origin",
	});
	if (!resolved || resolved.kind === "tag" || resolved.kind === "head") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `Branch "${row.branch}" no longer exists, so this workspace cannot be restored`,
		});
	}
	const branch = resolved.shortName;

	const checkedOutAt = (await listWorktreeBranches(git)).worktreeMap.get(
		branch,
	);
	if (checkedOutAt !== undefined && checkedOutAt !== row.worktreePath) {
		throw new TRPCError({
			code: "CONFLICT",
			message: `Branch "${branch}" is already checked out at ${checkedOutAt}`,
		});
	}
	// A registered worktree at the tombstone's own path is a delete the host
	// crashed out of before removing the directory; it is exactly what a
	// restore wants, so there is nothing to recreate.
	if (checkedOutAt === undefined) {
		if (lstatSync(row.worktreePath, { throwIfNoEntry: false }) !== undefined) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `Something else already exists at ${row.worktreePath}`,
			});
		}
		mkdirSync(dirname(row.worktreePath), { recursive: true });
		await addBranchWorktree({
			git,
			plan: { branch, startPoint: resolved, usedExistingBranch: true },
			worktreePath: row.worktreePath,
			sparsePaths: parseSparseCheckoutPaths(localProject.sparseCheckoutPaths),
		});
		await enablePushAutoSetupRemote(
			git,
			row.worktreePath,
			"[workspace-cleanup.revive]",
		);
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
