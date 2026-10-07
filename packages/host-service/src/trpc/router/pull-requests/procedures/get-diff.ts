import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../../index";
import { fetchPullRequestDiff } from "../shared/fetch-pull-request-diff";
import { contentTargetSchema, resolveContentTarget } from "./content-target";
import { gitLabDiff } from "./gitlab-project";

export const getDiff = protectedProcedure
	.input(contentTargetSchema)
	.query(async ({ ctx, input }) => {
		let native = input.provider === "gitlab" || !!input.expectedPullRequest;
		try {
			const target = await resolveContentTarget(ctx, input);
			native = target.provider === "gitlab";
			if (target.provider === "gitlab")
				return {
					patch: await gitLabDiff(target.repo, target.client, input.prNumber),
				};
			return await fetchPullRequestDiff(
				`${target.repo.owner}/${target.repo.name}`,
				input.prNumber,
			);
		} catch (error) {
			throw new TRPCError({
				code:
					native && error instanceof TRPCError
						? error.code
						: "INTERNAL_SERVER_ERROR",
				message: `Failed to fetch diff for PR #${input.prNumber}: ${error instanceof Error ? error.message : String(error)}`,
				cause: error,
			});
		}
	});
