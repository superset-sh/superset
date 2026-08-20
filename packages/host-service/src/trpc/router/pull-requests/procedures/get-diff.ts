import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { queryProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { execGh } from "../../workspace-creation/utils/exec-gh";

const getDiffInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});

export interface PullRequestDiffResult {
	/** Cumulative `git diff`-format output (base...head, `diff --git` per
	 *  file) — what `@pierre/diffs`' `parsePatchFiles` is built to consume.
	 *  Deliberately NOT `gh pr diff --patch`: that flag switches to a
	 *  `git format-patch` series with one `diff --git` block per commit, so
	 *  a file touched in multiple commits appears — and gets diffed —
	 *  more than once. */
	patch: string;
}

/** Powers the PR detail page's Code tab. Large/binary diffs come back
 *  patch-truncated or without hunks — same limitation the GitHub UI has. */
export const getDiff = queryProcedure
	.meta({ timeoutMs: 30_000 })
	.input(getDiffInputSchema)
	.query(async ({ ctx, input }): Promise<PullRequestDiffResult> => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		try {
			const raw = await execGh(
				[
					"pr",
					"diff",
					String(input.prNumber),
					"--repo",
					`${repo.owner}/${repo.name}`,
				],
				{ timeout: 25_000 },
			);
			return { patch: typeof raw === "string" ? raw : "" };
		} catch (err) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to fetch diff for PR #${input.prNumber}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	});
