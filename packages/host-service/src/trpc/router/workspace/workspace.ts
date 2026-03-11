import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { publicProcedure, router } from "../../index";

export const workspaceRouter = router({
	create: publicProcedure
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

			// Check if project exists locally
			let localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			// If not found locally, fetch from cloud and clone
			if (!localProject) {
				const cloudProject = await ctx.api.v2Project.get.query({
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

				const git = await ctx.git(repoPath);
				await git.clone(cloudProject.repoCloneUrl, repoPath);

				const inserted = ctx.db
					.insert(projects)
					.values({ id: input.projectId, repoPath })
					.returning()
					.get();

				localProject = inserted;
			}

			if (!localProject) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to resolve local project",
				});
			}

			// Create worktree
			const worktreePath = join(
				localProject.repoPath,
				".worktrees",
				input.branch,
			);

			const git = await ctx.git(localProject.repoPath);
			await git.raw(["worktree", "add", worktreePath, input.branch]);

			// Create cloud workspace (orgId implicit from auth session)
			const cloudRow = await ctx.api.v2Workspace.create.mutate({
				projectId: input.projectId,
				name: input.name,
				branch: input.branch,
			});

			// Track locally
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

	delete: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			if (!ctx.api) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cloud API not configured",
				});
			}

			// Look up local workspace
			const localWorkspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.id) })
				.sync();

			if (localWorkspace) {
				const localProject = ctx.db.query.projects
					.findFirst({ where: eq(projects.id, localWorkspace.projectId) })
					.sync();

				if (localProject) {
					try {
						const git = await ctx.git(localProject.repoPath);
						await git.raw(["worktree", "remove", localWorkspace.worktreePath]);
					} catch {
						// Best-effort worktree removal
					}
				}
			}

			// Delete from cloud (orgId implicit from auth session)
			await ctx.api.v2Workspace.delete.mutate({ id: input.id });

			// Delete local row
			ctx.db.delete(workspaces).where(eq(workspaces.id, input.id)).run();

			return { success: true };
		}),
});
