import { rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { publicProcedure, router } from "../../index";

export const projectRouter = router({
	removeFromDevice: publicProcedure
		.input(z.object({ projectId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			if (!localProject) {
				return { success: true };
			}

			// Find all local workspaces for this project
			const localWorkspaces = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, input.projectId))
				.all();

			// Best-effort remove each worktree
			for (const ws of localWorkspaces) {
				try {
					const git = await ctx.git(localProject.repoPath);
					await git.raw(["worktree", "remove", ws.worktreePath]);
				} catch {
					// Best-effort
				}
			}

			// Best-effort remove cloned repo directory
			try {
				rmSync(localProject.repoPath, { recursive: true, force: true });
			} catch {
				// Best-effort
			}

			// Delete local project row (cascades to local workspace rows)
			ctx.db.delete(projects).where(eq(projects.id, input.projectId)).run();

			return { success: true };
		}),
});
