import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects } from "../../../../db/schema";
import { resolveDefaultBranchName } from "../../../../runtime/git/refs";
import { protectedProcedure } from "../../../index";

export const getContext = protectedProcedure
	.input(z.object({ projectId: z.string() }))
	.query(async ({ ctx, input }) => {
		const localProject = ctx.db.query.projects
			.findFirst({ where: eq(projects.id, input.projectId) })
			.sync();

		if (!localProject) {
			return {
				projectId: input.projectId,
				hasLocalRepo: false,
				defaultBranch: null as string | null,
			};
		}

		const git = await ctx.git(localProject.repoPath);
		const defaultBranch: string | null = await resolveDefaultBranchName(git);

		return {
			projectId: input.projectId,
			hasLocalRepo: true,
			defaultBranch,
		};
	});
