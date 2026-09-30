import { z } from "zod";
import {
	assertGitLabIdentity,
	gitLabMergeRequestApiPath,
} from "../../../../source-control/gitlab/merge-requests";
import { protectedProcedure } from "../../../index";
import {
	resolveGithubRepo,
	resolveGitLabRepo,
} from "../../workspace-creation/shared/project-helpers";

export const markReady = protectedProcedure
	.input(
		z.object({
			projectId: z.string(),
			prNumber: z.number().int().positive(),
			provider: z.enum(["github", "gitlab"]).optional(),
			instance: z.string().optional(),
			repoPath: z.string().optional(),
		}),
	)
	.mutation(async ({ ctx, input }) => {
		if (input.provider === "gitlab") {
			const identity = await resolveGitLabRepo(ctx, input.projectId);
			assertGitLabIdentity(identity, input);
			await ctx.gitlab.api(
				identity,
				`${gitLabMergeRequestApiPath(identity, input.prNumber)}/notes`,
				{ method: "POST", fields: { body: "/ready" } },
			);
			return { ok: true };
		}
		const repo = await resolveGithubRepo(ctx, input.projectId);
		await ctx.execGh([
			"pr",
			"ready",
			String(input.prNumber),
			"--repo",
			`${repo.owner}/${repo.name}`,
		]);
		return { ok: true };
	});
