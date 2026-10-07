import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { HostServiceContext } from "../../../../types";
import {
	expectedGitlabPullRequestSchema,
	resolveExpectedGitlabPullRequest,
} from "../../git/gitlab-actions";
import {
	resolveGithubRepo,
	resolveRepo,
} from "../../workspace-creation/shared/project-helpers";
import { gitLabClient } from "./gitlab-project";

export const contentTargetSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	provider: z.enum(["github", "gitlab"]).optional(),
	expectedPullRequest: expectedGitlabPullRequestSchema.optional(),
});
export async function resolveContentTarget(
	ctx: HostServiceContext,
	input: z.infer<typeof contentTargetSchema>,
) {
	if (input.expectedPullRequest) {
		if (input.provider === "github")
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Merge request provider does not match the selected target",
			});
		const selection = await resolveExpectedGitlabPullRequest(
			ctx,
			input.expectedPullRequest,
			{ projectId: input.projectId, pullNumber: input.prNumber },
		);
		return {
			provider: "gitlab" as const,
			repo: selection.repo,
			client: gitLabClient(ctx, selection.repo),
		};
	}
	if (input.provider !== "gitlab") {
		try {
			return {
				provider: "github" as const,
				repo: await resolveGithubRepo(ctx, input.projectId),
			};
		} catch (error) {
			if (
				input.provider === "github" ||
				!(error instanceof TRPCError) ||
				error.code !== "BAD_REQUEST" ||
				!error.message.endsWith("has no GitHub remote.")
			)
				throw error;
		}
	}
	const repo = await resolveRepo(ctx, input.projectId);
	if (repo.provider !== "gitlab")
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Project does not resolve to the selected GitLab repository",
		});
	return { provider: "gitlab" as const, repo, client: gitLabClient(ctx, repo) };
}
