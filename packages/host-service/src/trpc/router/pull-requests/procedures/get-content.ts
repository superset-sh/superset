import { protectedProcedure } from "../../../index";
import { fetchPullRequestContent } from "../shared/fetch-pull-request-content";
import { contentTargetSchema, resolveContentTarget } from "./content-target";
import { gitLabContent } from "./gitlab-project";

export const getContent = protectedProcedure
	.input(contentTargetSchema)
	.query(async ({ ctx, input }) => {
		const target = await resolveContentTarget(ctx, input);
		return target.provider === "gitlab"
			? gitLabContent(target.repo, target.client, input.prNumber)
			: fetchPullRequestContent(target.repo, input.prNumber);
	});
