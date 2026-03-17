import { z } from "zod";
import { publicProcedure, router } from "../../index";

export const pullRequestsRouter = router({
	getByWorkspaces: publicProcedure
		.input(
			z.object({
				workspaceIds: z.array(z.string()),
			}),
		)
		.query(async ({ ctx, input }) => {
			const workspaces = await ctx.runtime.pullRequests.getPullRequestsByWorkspaces(
				input.workspaceIds,
			);
			return { workspaces };
		}),
});
