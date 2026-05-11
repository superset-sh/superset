import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../shared/project-helpers";

interface IssueDetail {
	issueNumber: number;
	title: string;
	body: string;
	url: string;
	state: string;
	authorLogin: string | null;
}

const ghIssueViewSchema = z.object({
	number: z.number(),
	title: z.string(),
	body: z.string().nullable().optional(),
	url: z.string(),
	state: z.string(),
	author: z.object({ login: z.string() }).nullable().optional(),
});

const ISSUE_VIEW_FIELDS = "number,title,body,url,state,author";

const getIssueInputSchema = z.object({
	projectId: z.string(),
	issueNumber: z.number().int().positive(),
});

export const getIssue = protectedProcedure
	.input(getIssueInputSchema)
	.query(async ({ ctx, input }): Promise<IssueDetail> => {
		const repo = await resolveGithubRepo(ctx, input.projectId);

		try {
			const raw = await ctx.execGh(
				[
					"issue",
					"view",
					String(input.issueNumber),
					"--repo",
					`${repo.owner}/${repo.name}`,
					"--json",
					ISSUE_VIEW_FIELDS,
				],
				{ cwd: repo.repoPath ?? undefined },
			);
			const issue = ghIssueViewSchema.parse(raw);
			if (issue.url.includes("/pull/")) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `#${input.issueNumber} is a pull request, not an issue`,
				});
			}
			return {
				issueNumber: issue.number,
				title: issue.title,
				body: issue.body ?? "",
				url: issue.url,
				state: issue.state.toLowerCase(),
				authorLogin: issue.author?.login ?? null,
			};
		} catch (ghErr) {
			if (ghErr instanceof TRPCError) throw ghErr;
			console.warn(
				"[workspaceCreation.getIssue] gh path failed; falling back to Octokit",
				ghErr,
			);
		}

		try {
			const octokit = await ctx.github();
			const { data: issue } = await octokit.issues.get({
				owner: repo.owner,
				repo: repo.name,
				issue_number: input.issueNumber,
			});
			if (issue.pull_request) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `#${input.issueNumber} is a pull request, not an issue`,
				});
			}
			return {
				issueNumber: issue.number,
				title: issue.title,
				body: issue.body ?? "",
				url: issue.html_url,
				state: issue.state.toLowerCase(),
				authorLogin: issue.user?.login ?? null,
			};
		} catch (err) {
			if (err instanceof TRPCError) throw err;
			console.warn("[workspaceCreation.getIssue] octokit fallback failed", err);
			throw err;
		}
	});
