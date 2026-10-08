import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { execGh } from "../../workspace-creation/utils/exec-gh";
import { syncPullRequestAfterWrite } from "../shared/sync-after-write";

const setDraftInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	draft: z.boolean(),
});

/** Marks an open pull request ready for review, or converts it back to a draft. */
export const setDraft = protectedProcedure
	.input(setDraftInputSchema)
	.mutation(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const action = input.draft ? "draft" : "ready";
		try {
			await execGh([
				"pr",
				"ready",
				...(input.draft ? ["--undo"] : []),
				String(input.prNumber),
				"--repo",
				`${repo.owner}/${repo.name}`,
			]);
		} catch (err) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to mark PR #${input.prNumber} ${input.draft ? "as a draft" : "ready for review"}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
		await syncPullRequestAfterWrite(ctx, {
			repo,
			prNumber: input.prNumber,
			action,
		});
		return { ok: true };
	});
