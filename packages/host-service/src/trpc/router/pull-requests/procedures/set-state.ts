import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { execGh } from "../../workspace-creation/utils/exec-gh";
import { syncPullRequestAfterWrite } from "../shared/sync-after-write";

const setStateInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	// Only open/closed — GitHub has no CLI verb to un-merge a PR, so a
	// merged state isn't reachable through this mutation.
	state: z.enum(["open", "closed"]),
});

export const setState = protectedProcedure
	.input(setStateInputSchema)
	.mutation(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
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
