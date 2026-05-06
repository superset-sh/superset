import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { invalidateLabelCache } from "../../../ports/static-ports";
import { protectedProcedure, router } from "../../index";

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

	cloudList: protectedProcedure.query(async ({ ctx }) => {
		const rows = await ctx.api.v2Workspace.list.query({
			organizationId: ctx.organizationId,
		});
		return rows.map((row) => ({
			id: row.id,
			projectId: row.projectId,
			branch: row.branch,
			hostId: row.hostId,
		}));
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
