import { TRPCError } from "@trpc/server";
import { and, eq, ne, or } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import { gitConfigWrite } from "../../git/utils/config-write";
import type { GitClient } from "./types";

export type AdoptedWorkspace = NonNullable<
	Awaited<
		ReturnType<HostServiceContext["api"]["v2Workspace"]["getFromHost"]["query"]>
	>
>;

export interface AdoptExistingWorktreeArgs {
	ctx: HostServiceContext;
	git: GitClient;
	projectId: string;
	branch: string;
	worktreePath: string;
	workspaceName: string;
	baseBranch?: string;
	/** v1→v2 migration relinks to a known cloud id; other callers leave undefined. */
	existingWorkspaceId?: string;
	/** Optimistic-UI idempotency key for v2Workspace.create; ignored on relink. */
	idempotencyId?: string;
	/** Task link for v2Workspace.create; ignored on relink. */
	taskId?: string;
	hostPromise: Promise<{ machineId: string }>;
}

export interface AdoptExistingWorktreeResult {
	workspace: AdoptedWorkspace;
	/** True when an existing cloud row was reused; false when a new row was
	 *  created in this call. Used by `workspaces.create` to decide whether
	 *  to dispatch setup terminal + sugar agents. */
	alreadyExists: boolean;
}

/**
 * Register a workspace for a worktree that already exists on disk. Owns
 * all the stale-row hygiene (relink by branch, relink-on-rename by path,
 * delete-stale-on-cloud-mismatch) so callers don't reinvent it.
 *
 * Cross-project safety is the caller's responsibility — only pass a
 * `worktreePath` that came from `git worktree list` on this project's
 * `git`. A path registered against a different repo's git dir won't be
 * detected here and will silently land as a row in the wrong project.
 */
export async function adoptExistingWorktree(
	args: AdoptExistingWorktreeArgs,
): Promise<AdoptExistingWorktreeResult> {
	const {
		ctx,
		git,
		projectId,
		branch,
		worktreePath,
		workspaceName,
		baseBranch,
		existingWorkspaceId,
		idempotencyId,
		taskId,
		hostPromise,
	} = args;

	if (existingWorkspaceId) {
		const existingCloud = await getHostWorkspace(ctx, existingWorkspaceId);
		if (existingCloud) {
			await recordBaseBranch(git, branch, baseBranch);
			deleteLocalWorkspaceConflicts(ctx, {
				projectId,
				worktreePath,
				branch,
				keepWorkspaceId: existingCloud.id,
			});
			persistLocalWorkspace(ctx, {
				id: existingCloud.id,
				projectId,
				worktreePath,
				branch,
			});
			return {
				workspace: existingCloud,
				alreadyExists: true,
			};
		}
	}

	// Already linked at this exact (branch, path) — reuse if cloud still has
	// the row, otherwise drop the orphaned local row and continue to create.
	const existingByBranch = ctx.db.query.workspaces
		.findFirst({
			where: and(
				eq(workspaces.projectId, projectId),
				eq(workspaces.branch, branch),
			),
		})
		.sync();
	if (existingByBranch && existingByBranch.worktreePath === worktreePath) {
		const existingCloud = await getHostWorkspace(ctx, existingByBranch.id);
		if (existingCloud) {
			await recordBaseBranch(git, branch, baseBranch);
			return {
				workspace: existingCloud,
				alreadyExists: true,
			};
		}
		deleteLocalWorkspace(ctx, existingByBranch.id);
	}

	// Same path, different branch — branch was renamed in place. Re-point
	// the cloud row at the new branch instead of leaving a phantom row.
	const existingByPath = ctx.db.query.workspaces
		.findFirst({
			where: and(
				eq(workspaces.projectId, projectId),
				eq(workspaces.worktreePath, worktreePath),
			),
		})
		.sync();
	if (existingByPath) {
		const existingCloud = await getHostWorkspace(ctx, existingByPath.id);
		if (existingCloud) {
			deleteLocalWorkspaceConflicts(ctx, {
				projectId,
				worktreePath,
				branch,
				keepWorkspaceId: existingByPath.id,
			});
			const updatedCloud = await ctx.api.v2Workspace.updateNameFromHost.mutate({
				id: existingCloud.id,
				branch,
			});
			ctx.db
				.update(workspaces)
				.set({ branch })
				.where(eq(workspaces.id, existingByPath.id))
				.run();
			await recordBaseBranch(git, branch, baseBranch);
			return {
				workspace: updatedCloud,
				alreadyExists: true,
			};
		}
		deleteLocalWorkspace(ctx, existingByPath.id);
	}

	let host: { machineId: string };
	try {
		host = await hostPromise;
	} catch (err) {
		if (err instanceof TRPCError) throw err;
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to register host: ${err instanceof Error ? err.message : String(err)}`,
		});
	}

	const cloudRow = await ctx.api.v2Workspace.create
		.mutate({
			organizationId: ctx.organizationId,
			projectId,
			name: workspaceName,
			branch,
			hostId: host.machineId,
			id: idempotencyId,
			taskId,
		})
		.catch((err) => {
			if (err instanceof TRPCError) throw err;
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to create workspace: ${err instanceof Error ? err.message : String(err)}`,
			});
		});

	if (!cloudRow) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Cloud workspace create returned no row",
		});
	}

	await recordBaseBranch(git, branch, baseBranch);

	// Stale local row for this (project, branch or path) typically points
	// at a deleted cloud row — the new cloudRow.id is authoritative.
	deleteLocalWorkspaceConflicts(ctx, {
		projectId,
		worktreePath,
		branch,
		keepWorkspaceId: cloudRow.id,
	});

	try {
		persistLocalWorkspace(ctx, {
			id: cloudRow.id,
			projectId,
			worktreePath,
			branch,
		});
	} catch (err) {
		await ctx.api.v2Workspace.delete
			.mutate({ id: cloudRow.id })
			.catch((cleanupErr) => {
				console.warn(
					"[adoptExistingWorktree] failed to rollback cloud workspace",
					{ workspaceId: cloudRow.id, err: cleanupErr },
				);
			});
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to persist workspace locally: ${err instanceof Error ? err.message : String(err)}`,
		});
	}

	return {
		workspace: cloudRow,
		alreadyExists: false,
	};
}

async function getHostWorkspace(
	ctx: HostServiceContext,
	workspaceId: string,
): Promise<AdoptedWorkspace | null> {
	return ctx.api.v2Workspace.getFromHost.query({
		organizationId: ctx.organizationId,
		id: workspaceId,
	});
}

function deleteLocalWorkspace(
	ctx: HostServiceContext,
	workspaceId: string,
): void {
	ctx.db.delete(workspaces).where(eq(workspaces.id, workspaceId)).run();
}

function persistLocalWorkspace(
	ctx: HostServiceContext,
	args: {
		id: string;
		projectId: string;
		worktreePath: string;
		branch: string;
	},
): void {
	ctx.db
		.insert(workspaces)
		.values({
			id: args.id,
			projectId: args.projectId,
			worktreePath: args.worktreePath,
			branch: args.branch,
		})
		.onConflictDoUpdate({
			target: workspaces.id,
			set: {
				projectId: args.projectId,
				worktreePath: args.worktreePath,
				branch: args.branch,
			},
		})
		.run();
}

function deleteLocalWorkspaceConflicts(
	ctx: HostServiceContext,
	args: {
		projectId: string;
		worktreePath: string;
		branch: string;
		keepWorkspaceId: string;
	},
): void {
	ctx.db
		.delete(workspaces)
		.where(
			and(
				eq(workspaces.projectId, args.projectId),
				or(
					eq(workspaces.branch, args.branch),
					eq(workspaces.worktreePath, args.worktreePath),
				),
				ne(workspaces.id, args.keepWorkspaceId),
			),
		)
		.run();
}

async function recordBaseBranch(
	git: GitClient,
	branch: string,
	baseBranch: string | undefined,
): Promise<void> {
	if (!baseBranch) return;
	await gitConfigWrite(git as Parameters<typeof gitConfigWrite>[0], [
		"config",
		`branch.${branch}.base`,
		baseBranch,
	]).catch((err) => {
		console.warn(
			`[adoptExistingWorktree] failed to record base branch ${baseBranch}:`,
			err,
		);
	});
}
