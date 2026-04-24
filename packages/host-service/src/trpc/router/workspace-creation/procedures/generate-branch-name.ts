import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects } from "../../../../db/schema";
import { protectedProcedure } from "../../../index";
import { listBranchNames } from "../branch-helpers";
import { generateBranchNameFromPrompt } from "../utils/ai-branch-name";

export const generateBranchName = protectedProcedure
	.input(z.object({ projectId: z.string(), prompt: z.string() }))
	.mutation(async ({ ctx, input }) => {
		const trimmed = input.prompt.trim();
		if (!trimmed) return { branchName: null };

		const localProject = ctx.db.query.projects
			.findFirst({ where: eq(projects.id, input.projectId) })
			.sync();
		if (!localProject) return { branchName: null };

		const existingBranches = await listBranchNames(ctx, localProject.repoPath);
		const branchName = await generateBranchNameFromPrompt(
			trimmed,
			existingBranches,
		);
		return { branchName };
	});
