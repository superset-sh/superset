import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { execGlab } from "../../workspace-creation/utils/exec-glab";
import { fetchPullRequestDiff } from "../shared/fetch-pull-request-diff";

export const getDiff = protectedProcedure
	.input(
		z.object({ projectId: z.string(), prNumber: z.number().int().positive() }),
	)
	.query(async ({ ctx, input }) => {
		try {
			const gitlab = await ctx.runtime.pullRequests.getGitLabRepository(
				input.projectId,
			);
			if (gitlab) {
				const diff = [
					"mr",
					"diff",
					String(input.prNumber),
					"-R",
					gitlab.url,
					"--raw",
				];
				const patch = await execGlab(diff, {
					timeout: 30_000,
					maxBuffer: 200 * 1024 * 1024,
				});
				return { patch: String(patch) };
			}
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
