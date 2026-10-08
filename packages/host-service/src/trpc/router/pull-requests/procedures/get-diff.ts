import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { fetchPullRequestDiff } from "../shared/fetch-pull-request-diff";

export const getDiff = protectedProcedure
	.input(
		z.object({ projectId: z.string(), prNumber: z.number().int().positive() }),
	)
	.query(async ({ ctx, input }) => {
		try {
			const repo = await resolveGithubRepo(ctx, input.projectId);
			return await fetchPullRequestDiff(
				`${repo.owner}/${repo.name}`,
				input.prNumber,
			);
		} catch (err) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to fetch diff for PR #${input.prNumber}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	});
