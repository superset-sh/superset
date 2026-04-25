import { protectedProcedure } from "../../../index";
import { generateBranchNameInputSchema } from "../schemas";
import { findLocalProject } from "../shared/local-project";
import { generateBranchNameFromPrompt } from "../utils/ai-branch-name";
import { listBranchNames } from "../utils/list-branch-names";

export const generateBranchName = protectedProcedure
	.input(generateBranchNameInputSchema)
	.mutation(async ({ ctx, input }) => {
		const trimmed = input.prompt.trim();
		if (!trimmed) return { branchName: null };

		const localProject = findLocalProject(ctx, input.projectId);
		if (!localProject) return { branchName: null };

		const existingBranches = await listBranchNames(ctx, localProject.repoPath);
		const branchName = await generateBranchNameFromPrompt(
			trimmed,
			existingBranches,
		);
		return { branchName };
	});
