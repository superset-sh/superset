import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { PrSchema } from "../github-schemas";
import { resolveGithubRepo } from "../helpers";
import { execGh } from "../utils/exec-gh";

export const getGitHubPullRequestContent = protectedProcedure
	.input(
		z.object({
			projectId: z.string(),
			prNumber: z.number().int().positive(),
		}),
	)
	.query(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		try {
			const raw = await execGh([
				"pr",
				"view",
				String(input.prNumber),
				"--repo",
				`${repo.owner}/${repo.name}`,
				"--json",
				"number,title,body,url,state,author,headRefName,baseRefName,headRepositoryOwner,isCrossRepository,isDraft,createdAt,updatedAt",
			]);
			const data = PrSchema.parse(raw);
			return {
				number: data.number,
				title: data.title,
				body: data.body ?? "",
				url: data.url,
				state: data.state.toLowerCase(),
				branch: data.headRefName,
				baseBranch: data.baseRefName,
				headRepositoryOwner: data.headRepositoryOwner?.login ?? null,
				isCrossRepository: data.isCrossRepository,
				author: data.author?.login ?? null,
				isDraft: data.isDraft,
				createdAt: data.createdAt,
				updatedAt: data.updatedAt,
			};
		} catch (err) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to fetch PR #${input.prNumber}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	});
