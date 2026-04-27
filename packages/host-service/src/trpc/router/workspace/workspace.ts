import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getHostId, getHostName } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import simpleGit from "simple-git";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { invalidateLabelCache } from "../../../ports/static-ports";
import { protectedProcedure, router } from "../../index";
import { ensureMainWorkspace } from "../project/utils/ensure-main-workspace";

export const workspaceRouter = router({
	get: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(({ ctx, input }) => {
			const localWorkspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.id) })
				.sync();

			if (!localWorkspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}

			return localWorkspace;
		}),

	create: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				name: z.string().min(1),
				branch: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.api) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cloud API not configured",
				});
			}

			let localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			if (!localProject) {
				const cloudProject = await ctx.api.v2Project.get.query({
					organizationId: ctx.organizationId,
					id: input.projectId,
				});

				if (!cloudProject.repoCloneUrl) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Project has no linked GitHub repository — cannot clone",
					});
				}

				const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
				const repoPath = join(homeDir, ".superset", "repos", input.projectId);

				if (!existsSync(repoPath)) {
					mkdirSync(dirname(repoPath), { recursive: true });
					await simpleGit().clone(cloudProject.repoCloneUrl, repoPath);
				}

				const inserted = ctx.db
					.insert(projects)
					.values({ id: input.projectId, repoPath })
					.returning()
					.get();

				localProject = inserted;
			}

			await ensureMainWorkspace(ctx, input.projectId, localProject.repoPath);

			const worktreePath = join(
				localProject.repoPath,
				".worktrees",
				input.branch,
			);
			const machineId = getHostId();
			const hostName = getHostName();

			const git = await ctx.git(localProject.repoPath);
			try {
				await git.raw(["worktree", "add", worktreePath, input.branch]);
			} catch {
				await git.raw(["worktree", "add", "-b", input.branch, worktreePath]);
			}

			const host = await ctx.api.host.ensure.mutate({
				organizationId: ctx.organizationId,
				machineId,
				name: hostName,
			});

			const cloudRow = await ctx.api.v2Workspace.create
				.mutate({
					organizationId: ctx.organizationId,
					projectId: input.projectId,
					name: input.name,
					branch: input.branch,
					hostId: host.machineId,
				})
				.catch(async (err) => {
					try {
						await git.raw(["worktree", "remove", worktreePath]);
					} catch (cleanupErr) {
						console.warn("[workspace.create] failed to rollback worktree", {
							worktreePath,
							cleanupErr,
						});
					}
					throw err;
				});

			if (cloudRow) {
				ctx.db
					.insert(workspaces)
					.values({
						id: cloudRow.id,
						projectId: input.projectId,
						worktreePath,
						branch: input.branch,
					})
					.run();
			}

			return cloudRow;
		}),

	gitStatus: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const localWorkspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.id) })
				.sync();

			if (!localWorkspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}

			const git = await ctx.git(localWorkspace.worktreePath);
			const status = await git.status();

			return {
				workspaceId: input.id,
				branch: status.current,
				files: status.files.map((f) => ({
					path: f.path,
					index: f.index,
					workingDir: f.working_dir,
				})),
				isClean: status.isClean(),
			};
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			if (!ctx.api) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cloud API not configured",
				});
			}

			const localWorkspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.id) })
				.sync();
			const localProject = localWorkspace
				? ctx.db.query.projects
						.findFirst({ where: eq(projects.id, localWorkspace.projectId) })
						.sync()
				: undefined;

			if (
				localWorkspace &&
				localProject &&
				localWorkspace.worktreePath === localProject.repoPath
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Main workspaces cannot be deleted. Remove them from the sidebar or remove the project from this host instead.",
				});
			}

			const cloudWorkspace = await ctx.api.v2Workspace.getFromHost.query({
				organizationId: ctx.organizationId,
				id: input.id,
			});
			if (cloudWorkspace?.type === "main") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Main workspaces cannot be deleted. Remove them from the sidebar or remove the project from this host instead.",
				});
			}

			await ctx.api.v2Workspace.delete.mutate({ id: input.id });

			if (localWorkspace) {
				if (localProject) {
					try {
						const git = await ctx.git(localProject.repoPath);
						await git.raw(["worktree", "remove", localWorkspace.worktreePath]);
					} catch (err) {
						console.warn("[workspace.delete] failed to remove worktree", {
							workspaceId: input.id,
							worktreePath: localWorkspace.worktreePath,
							err,
						});
					}
				}
			}

			ctx.db.delete(workspaces).where(eq(workspaces.id, input.id)).run();
			invalidateLabelCache(input.id);

			return { success: true };
		}),
});
