import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { actionRejectionError } from "../../github/github";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { execGh } from "../../workspace-creation/utils/exec-gh";
import { syncPullRequestAfterWrite } from "../shared/sync-after-write";
import { syncGitLabPullRequestAfterWrite } from "../shared/sync-gitlab-after-write";
import {
	gitLabClient,
	invalidateGitLabReads,
	resolveGitLabProject,
} from "./gitlab-project";
import { resolveLegacyPullRequest } from "./legacy-client-compat";

const setStateInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	expectedUrl: z.string().url().optional(),
	// Only open/closed — GitHub has no CLI verb to un-merge a PR, so a
	// merged state isn't reachable through this mutation.
	state: z.enum(["open", "closed"]),
});

export const setState = protectedProcedure
	.input(setStateInputSchema)
	.mutation(async ({ ctx, input }) => {
		const selected = input.expectedUrl
			? await resolveLegacyPullRequest(ctx, input)
			: null;
		const gitlab = selected
			? selected.provider === "gitlab"
				? { repo: selected, client: gitLabClient(ctx, selected) }
				: null
			: await resolveGitLabProject(ctx, input.projectId);
		if (gitlab) {
			try {
				await gitlab.client.setPullRequestState(
					gitlab.repo,
					input.prNumber,
					input.state,
				);
			} catch (error) {
				throw actionRejectionError(error, "GitLab refused the state change.");
			}
			invalidateGitLabReads(gitlab.repo, input.prNumber);
			await syncGitLabPullRequestAfterWrite(ctx, {
				repo: gitlab.repo,
				prNumber: input.prNumber,
				expectedUrl: input.expectedUrl,
				action: input.state === "closed" ? "close" : "reopen",
			});
			return { ok: true };
		}
		const repo = selected ?? (await resolveGithubRepo(ctx, input.projectId));
		const verb = input.state === "closed" ? "close" : "reopen";
		try {
			await execGh([
				"pr",
				verb,
				String(input.prNumber),
				"--repo",
				`${repo.owner}/${repo.name}`,
			]);
		} catch (err) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to ${verb} PR #${input.prNumber}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
		await syncPullRequestAfterWrite(ctx, {
			repo,
			prNumber: input.prNumber,
			action: verb,
		});
		return { ok: true };
	});
