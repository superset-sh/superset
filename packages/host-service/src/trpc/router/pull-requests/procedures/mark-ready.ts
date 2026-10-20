import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../../db/schema";
import { protectedProcedure } from "../../../index";
import { actionRejectionError } from "../../github/github";
import { resolvePullRequestRepository } from "../resolve-repository";

export const markReady = protectedProcedure
	.input(
		z.object({
			workspaceId: z.string(),
			prNumber: z.number().int().positive(),
		}),
	)
	.mutation(async ({ ctx, input }) => {
		const workspace = ctx.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, input.workspaceId) })
			.sync();
		if (!workspace?.projectId)
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Workspace is not linked to a project",
			});
		const repo = await resolvePullRequestRepository(ctx, workspace.projectId);
		try {
			if (repo.provider === "gitlab") {
				await ctx.execGlab(
					[
						"mr",
						"update",
						String(input.prNumber),
						"--repo",
						repo.url,
						"--ready",
					],
					{ cwd: repo.repoPath },
				);
			} else {
				const octokit = await ctx.github();
				const { data } = await octokit.pulls.get({
					owner: repo.owner,
					repo: repo.name,
					pull_number: input.prNumber,
				});
				await octokit.graphql(
					`mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`,
					{ id: data.node_id },
				);
			}
			return { ok: true };
		} catch (error) {
			throw actionRejectionError(
				error,
				"Could not mark the request ready for review.",
			);
		}
	});
