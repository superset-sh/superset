import { getHostId, getHostName } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import { and, eq, ne, or } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import { protectedProcedure } from "../../../index";
import { ensureMainWorkspace } from "../../project/utils/ensure-main-workspace";
import { adoptInputSchema } from "../schemas";
import {
	getWorktreeBranchAtPath,
	listWorktreeBranches,
} from "../shared/branch-search";
import { requireLocalProject } from "../shared/local-project";
import type { GitClient, TerminalDescriptor } from "../shared/types";

type HostWorkspace = NonNullable<
	Awaited<
		ReturnType<HostServiceContext["api"]["v2Workspace"]["getFromHost"]["query"]>
	>
>;

function adoptResult(workspace: HostWorkspace) {
	return {
		workspace,
		terminals: [] as TerminalDescriptor[],
		warnings: [] as string[],
	};
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

async function getHostWorkspace(
	ctx: HostServiceContext,
	workspaceId: string,
): Promise<HostWorkspace | null> {
	return ctx.api.v2Workspace.getFromHost.query({
		organizationId: ctx.organizationId,
		id: workspaceId,
	});
}

async function recordBaseBranch(
	git: GitClient,
	branch: string,
	baseBranch: string | undefined,
): Promise<void> {
	if (!baseBranch) return;
	await git
		.raw(["config", `branch.${branch}.base`, baseBranch])
		.catch((err) => {
			console.warn(
				`[workspaceCreation.adopt] failed to record base branch ${baseBranch}:`,
				err,
			);
		});
}

export const adopt = protectedProcedure
	.input(adoptInputSchema)
	.mutation(async ({ ctx, input }) => {
		const machineId = getHostId();
		const hostName = getHostName();

		const localProject = requireLocalProject(ctx, input.projectId);
		await ensureMainWorkspace(ctx, input.projectId, localProject.repoPath);

		let branch = input.branch.trim();
		if (!branch) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Branch name is empty",
			});
		}

		const git = await ctx.git(localProject.repoPath);

		let worktreePath: string;
		if (input.worktreePath) {
			const actualBranch = await getWorktreeBranchAtPath(
				git,
				input.worktreePath,
			);
			if (!actualBranch) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `No git worktree registered at "${input.worktreePath}"`,
				});
			}
			branch = actualBranch;
			worktreePath = input.worktreePath;
		} else {
			const { worktreeMap } = await listWorktreeBranches(
				ctx,
				git,
				input.projectId,
			);
			const found = worktreeMap.get(branch);
			if (!found) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `No existing worktree for branch "${branch}"`,
				});
			}
			worktreePath = found;
		}

		if (input.existingWorkspaceId) {
			const existingCloud = await getHostWorkspace(
				ctx,
				input.existingWorkspaceId,
			);
			if (existingCloud) {
				await recordBaseBranch(git, branch, input.baseBranch);
				deleteLocalWorkspaceConflicts(ctx, {
					projectId: input.projectId,
					worktreePath,
					branch,
					keepWorkspaceId: existingCloud.id,
				});
				try {
					persistLocalWorkspace(ctx, {
						id: existingCloud.id,
						projectId: input.projectId,
						worktreePath,
						branch,
					});
				} catch (err) {
					console.error(
						"[workspaceCreation.adopt] local workspace relink failed",
						err,
					);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: `Failed to persist existing workspace locally: ${err instanceof Error ? err.message : String(err)}`,
					});
				}
				return adoptResult(existingCloud);
			}
		}

		const existingLocal = ctx.db.query.workspaces
			.findFirst({
				where: and(
					eq(workspaces.projectId, input.projectId),
					eq(workspaces.branch, branch),
				),
			})
			.sync();
		if (existingLocal && existingLocal.worktreePath === worktreePath) {
			const existingCloud = await getHostWorkspace(ctx, existingLocal.id);
			if (existingCloud) {
				await recordBaseBranch(git, branch, input.baseBranch);
				return adoptResult(existingCloud);
			}
			deleteLocalWorkspace(ctx, existingLocal.id);
		}

		const existingLocalByPath = ctx.db.query.workspaces
			.findFirst({
				where: and(
					eq(workspaces.projectId, input.projectId),
					eq(workspaces.worktreePath, worktreePath),
				),
			})
			.sync();
		if (existingLocalByPath) {
			const existingCloud = await getHostWorkspace(ctx, existingLocalByPath.id);
			if (existingCloud) {
				deleteLocalWorkspaceConflicts(ctx, {
					projectId: input.projectId,
					worktreePath,
					branch,
					keepWorkspaceId: existingLocalByPath.id,
				});
				const updatedCloud =
					await ctx.api.v2Workspace.updateNameFromHost.mutate({
						id: existingCloud.id,
						branch,
					});
				ctx.db
					.update(workspaces)
					.set({ branch })
					.where(eq(workspaces.id, existingLocalByPath.id))
					.run();
				await recordBaseBranch(git, branch, input.baseBranch);
				return adoptResult(updatedCloud);
			}
			deleteLocalWorkspace(ctx, existingLocalByPath.id);
		}

		let host: { machineId: string };
		try {
			host = await ctx.api.host.ensure.mutate({
				organizationId: ctx.organizationId,
				machineId,
				name: hostName,
			});
		} catch (err) {
			if (err instanceof TRPCError) throw err;
			console.error("[workspaceCreation.adopt] host.ensure failed", err);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to register host: ${err instanceof Error ? err.message : String(err)}`,
			});
		}

		let cloudRow: Awaited<ReturnType<typeof ctx.api.v2Workspace.create.mutate>>;
		try {
			cloudRow = await ctx.api.v2Workspace.create.mutate({
				organizationId: ctx.organizationId,
				projectId: input.projectId,
				name: input.workspaceName,
				branch,
				hostId: host.machineId,
			});
		} catch (err) {
			if (err instanceof TRPCError) throw err;
			console.error("[workspaceCreation.adopt] v2Workspace.create failed", err);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to create workspace: ${err instanceof Error ? err.message : String(err)}`,
			});
		}

		if (!cloudRow) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Cloud workspace create returned no row",
			});
		}

		await recordBaseBranch(git, branch, input.baseBranch);

		// Replace any stale local row for this (project, branch) — its
		// id likely points at a deleted cloud row. The new cloudRow.id
		// is the authoritative mapping.
		deleteLocalWorkspaceConflicts(ctx, {
			projectId: input.projectId,
			worktreePath,
			branch,
			keepWorkspaceId: cloudRow.id,
		});

		try {
			persistLocalWorkspace(ctx, {
				id: cloudRow.id,
				projectId: input.projectId,
				worktreePath,
				branch,
			});
		} catch (err) {
			console.error(
				"[workspaceCreation.adopt] local workspaces insert failed",
				err,
			);
			await ctx.api.v2Workspace.delete
				.mutate({ id: cloudRow.id })
				.catch((cleanupErr) => {
					console.warn(
						"[workspaceCreation.adopt] failed to rollback cloud workspace",
						{ workspaceId: cloudRow.id, err: cleanupErr },
					);
				});
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to persist workspace locally: ${err instanceof Error ? err.message : String(err)}`,
			});
		}

		return adoptResult(cloudRow);
	});
