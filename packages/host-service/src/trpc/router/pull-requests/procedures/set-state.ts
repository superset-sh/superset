import { TRPCError } from "@trpc/server";
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
import { execGh } from "../../workspace-creation/utils/exec-gh";

const setStateInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	provider: z.enum(["github", "gitlab"]).optional(),
	instance: z.string().optional(),
	repoPath: z.string().optional(),
	// Only open/closed — GitHub has no CLI verb to un-merge a PR, so a
	// merged state isn't reachable through this mutation.
	state: z.enum(["open", "closed"]),
});

export const setState = protectedProcedure
	.input(setStateInputSchema)
	.mutation(async ({ ctx, input }) => {
		if (input.provider === "gitlab") {
			const identity = await resolveGitLabRepo(ctx, input.projectId);
			assertGitLabIdentity(identity, input);
			await ctx.gitlab.api(
				identity,
				gitLabMergeRequestApiPath(identity, input.prNumber),
				{
					method: "PUT",
					fields: {
						state_event: input.state === "closed" ? "close" : "reopen",
					},
				},
			);
			return { ok: true };
		}
		const repo = await resolveGithubRepo(ctx, input.projectId);
		try {
			await execGh([
				"pr",
				input.state === "closed" ? "close" : "reopen",
				String(input.prNumber),
				"--repo",
				`${repo.owner}/${repo.name}`,
			]);
			return { ok: true };
		} catch (err) {
			const verb = input.state === "closed" ? "close" : "reopen";
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to ${verb} PR #${input.prNumber}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	});
