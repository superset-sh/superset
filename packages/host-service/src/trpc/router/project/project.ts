import { rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { publicProcedure, router } from "../../index";

export const projectRouter = router({
	// TODO: remove
	removeFromDevice: publicProcedure
		.input(z.object({ projectId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			if (!localProject) {
				return { success: true };
			}

			const localWorkspaces = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, input.projectId))
				.all();

			for (const ws of localWorkspaces) {
				try {
					const git = await ctx.git(localProject.repoPath);
					await git.raw(["worktree", "remove", ws.worktreePath]);
				} catch (err) {
					console.warn("[project.removeFromDevice] failed to remove worktree", {
						projectId: input.projectId,
						worktreePath: ws.worktreePath,
						err,
					});
				}
			}

			try {
				rmSync(localProject.repoPath, { recursive: true, force: true });
			} catch (err) {
				console.warn("[project.removeFromDevice] failed to remove repo dir", {
					projectId: input.projectId,
					repoPath: localProject.repoPath,
					err,
				});
			}

			ctx.db.delete(projects).where(eq(projects.id, input.projectId)).run();

			return { success: true };
		}),
});
