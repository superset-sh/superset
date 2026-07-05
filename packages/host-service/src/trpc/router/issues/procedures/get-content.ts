import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { execGh } from "../../workspace-creation/utils/exec-gh";

const getContentInputSchema = z.object({
	projectId: z.string(),
	issueNumber: z.number().int().positive(),
});

const ghIssueContentSchema = z.object({
	number: z.number(),
	title: z.string(),
	body: z.string().nullable().optional(),
	url: z.string(),
	state: z.string(),
	author: z.object({ login: z.string() }).optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});

// Shell out to the user's `gh` CLI rather than host-service's
// octokit — `gh auth login` works out of the box while the
// credential-manager path requires setup most users don't have.
export const getContent = protectedProcedure
	.input(getContentInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		try {
			const raw = await execGh([
				"issue",
				"view",
				String(input.issueNumber),
				"--repo",
				`${repo.owner}/${repo.name}`,
				"--json",
				"number,title,body,url,state,author,createdAt,updatedAt",
			]);
			const data = ghIssueContentSchema.parse(raw);
			return {
				number: data.number,
				title: data.title,
				body: data.body ?? "",
				url: data.url,
				state: data.state.toLowerCase(),
				author: data.author?.login ?? null,
				createdAt: data.createdAt,
				updatedAt: data.updatedAt,
			};
		} catch (err) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to fetch issue #${input.issueNumber}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	});
