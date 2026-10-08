import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { execGh } from "../../workspace-creation/utils/exec-gh";
import { evictPullRequestContent } from "../shared/pull-request-content-cache";

const addCommentInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	// GitHub rejects bodies past 65536 characters; stop them before the spawn.
	body: z.string().trim().min(1).max(65536),
});

/** Posts a conversation comment on the pull request as the gh user. */
export const addComment = protectedProcedure
	.input(addCommentInputSchema)
	.mutation(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		try {
			// One REST request: `gh pr comment` posts over GraphQL and then reads
			// back, and a failure in that read reported a comment that had landed.
			await execGh(
				[
					"api",
					"--method",
					"POST",
					`repos/${repo.owner}/${repo.name}/issues/${input.prNumber}/comments`,
					"--input",
					"-",
				],
				{ input: JSON.stringify({ body: input.body }) },
			);
		} catch (err) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to comment on PR #${input.prNumber}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
		// The cached `gh pr view` would answer the refetch without the new comment.
		evictPullRequestContent(repo, input.prNumber);
		return { ok: true };
	});
