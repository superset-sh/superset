import { resolveDefaultBranchName } from "../../../../runtime/git/refs";
import { protectedProcedure } from "../../../index";
import { getContextInputSchema } from "../schemas";
import { findLocalProject } from "../shared/local-project";

export const getContext = protectedProcedure
	.input(getContextInputSchema)
	.query(async ({ ctx, input }) => {
		const localProject = findLocalProject(ctx, input.projectId);

		if (!localProject) {
			return {
				projectId: input.projectId,
				hasLocalRepo: false,
				defaultBranch: null as string | null,
			};
		}

		const git = await ctx.git(localProject.repoPath);
		const defaultBranch = await resolveDefaultBranchName(git);

		return {
			projectId: input.projectId,
			hasLocalRepo: true,
			defaultBranch,
		};
	});
