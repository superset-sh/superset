import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { normalizeGitHubQuery } from "../normalize-github-query";
import { githubSearchInputSchema } from "../schemas";
import {
	type ResolvedGithubRepo,
	resolveGithubRepo,
} from "../shared/project-helpers";
import type { ExecGh } from "../utils/exec-gh";

interface IssueResult {
	issueNumber: number;
	title: string;
	url: string;
	state: string;
	authorLogin: string | null;
}

interface IssuesPage {
	issues: IssueResult[];
	totalCount: number;
	hasNextPage: boolean;
	page: number;
	repoMismatch?: string;
}

const ghIssueViewSchema = z.object({
	number: z.number(),
	title: z.string(),
	url: z.string(),
	state: z.string(),
	author: z.object({ login: z.string() }).nullable().optional(),
});

const ISSUE_VIEW_FIELDS = "number,title,url,state,author";

async function ghDirectLookup(
	execGh: ExecGh,
	repo: ResolvedGithubRepo,
	issueNumber: number,
): Promise<IssueResult> {
	const raw = await execGh(
		[
			"issue",
			"view",
			String(issueNumber),
			"--repo",
			`${repo.owner}/${repo.name}`,
			"--json",
			ISSUE_VIEW_FIELDS,
		],
		{ cwd: repo.repoPath ?? undefined },
	);
	const issue = ghIssueViewSchema.parse(raw);
	return {
		issueNumber: issue.number,
		title: issue.title,
		url: issue.url,
		state: issue.state.toLowerCase(),
		authorLogin: issue.author?.login ?? null,
	};
}

const searchIssuesItemSchema = z.object({
	number: z.number(),
	title: z.string(),
	html_url: z.string(),
	state: z.string(),
	user: z.object({ login: z.string() }).nullable().optional(),
	pull_request: z.unknown().optional(),
});

const searchIssuesResponseSchema = z.object({
	total_count: z.number(),
	items: z.array(searchIssuesItemSchema),
});

async function ghApiSearchIssues(
	execGh: ExecGh,
	repo: ResolvedGithubRepo,
	query: string,
	includeClosed: boolean,
	page: number,
	perPage: number,
): Promise<{
	items: IssueResult[];
	totalCount: number;
	hasNextPage: boolean;
}> {
	const stateFilter = includeClosed ? "" : " is:open";
	const q =
		`repo:${repo.owner}/${repo.name} is:issue${stateFilter}${query ? ` ${query}` : ""}`.trim();
	const args = [
		"api",
		"-X",
		"GET",
		"search/issues",
		"-f",
		`q=${q}`,
		"-F",
		`per_page=${perPage}`,
		"-F",
		`page=${page}`,
		"-f",
		"sort=updated",
		"-f",
		"order=desc",
	];
	const raw = await execGh(args, { cwd: repo.repoPath ?? undefined });
	const parsed = searchIssuesResponseSchema.parse(raw);
	const items: IssueResult[] = parsed.items
		.filter((item) => !item.pull_request)
		.map((item) => ({
			issueNumber: item.number,
			title: item.title,
			url: item.html_url,
			state: item.state.toLowerCase(),
			authorLogin: item.user?.login ?? null,
		}));
	const hasNextPage = page * perPage < parsed.total_count;
	return { items, totalCount: parsed.total_count, hasNextPage };
}

export const searchGitHubIssues = protectedProcedure
	.input(githubSearchInputSchema)
	.query(async ({ ctx, input }): Promise<IssuesPage> => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const limit = input.limit ?? 30;
		const page = input.page ?? 1;

		const raw = input.query?.trim() ?? "";
		const normalized = normalizeGitHubQuery(raw, repo, "issue");

		if (normalized.repoMismatch) {
			return {
				issues: [],
				totalCount: 0,
				hasNextPage: false,
				page,
				repoMismatch: `${repo.owner}/${repo.name}`,
			};
		}

		const effectiveQuery = normalized.query;

		try {
			if (normalized.isDirectLookup) {
				const issueNumber = Number.parseInt(effectiveQuery, 10);
				const issue = await ghDirectLookup(ctx.execGh, repo, issueNumber);
				// `gh issue view <n>` happily returns a PR when N is a PR
				// number — GitHub's API surface treats PRs as a kind of issue.
				// Octokit's path filters via `issue.pull_request`; we don't
				// have that field over `gh`, so detect via the canonical URL.
				if (issue.url.includes("/pull/")) {
					return {
						issues: [],
						totalCount: 0,
						hasNextPage: false,
						page,
					};
				}
				return {
					issues: [issue],
					totalCount: 1,
					hasNextPage: false,
					page,
				};
			}
			const result = await ghApiSearchIssues(
				ctx.execGh,
				repo,
				effectiveQuery,
				input.includeClosed ?? false,
				page,
				limit,
			);
			return {
				issues: result.items,
				totalCount: result.totalCount,
				hasNextPage: result.hasNextPage,
				page,
			};
		} catch (ghErr) {
			console.warn(
				"[workspaceCreation.searchGitHubIssues] gh path failed; falling back to Octokit",
				ghErr,
			);
		}

		const octokit = await ctx.github();

		try {
			if (normalized.isDirectLookup) {
				const issueNumber = Number.parseInt(effectiveQuery, 10);
				const { data: issue } = await octokit.issues.get({
					owner: repo.owner,
					repo: repo.name,
					issue_number: issueNumber,
				});
				if (issue.pull_request) {
					return {
						issues: [],
						totalCount: 0,
						hasNextPage: false,
						page,
					};
				}
				return {
					issues: [
						{
							issueNumber: issue.number,
							title: issue.title,
							url: issue.html_url,
							state: issue.state,
							authorLogin: issue.user?.login ?? null,
						},
					],
					totalCount: 1,
					hasNextPage: false,
					page,
				};
			}

			const stateFilter = input.includeClosed ? "" : " is:open";
			const query =
				`repo:${repo.owner}/${repo.name} is:issue${stateFilter} ${effectiveQuery}`.trim();
			const { data } = await octokit.search.issuesAndPullRequests({
				q: query,
				per_page: limit,
				page,
				sort: "updated",
				order: "desc",
			});
			const issues = data.items
				.filter((item) => !item.pull_request)
				.map((item) => ({
					issueNumber: item.number,
					title: item.title,
					url: item.html_url,
					state: item.state,
					authorLogin: item.user?.login ?? null,
				}));
			const hasNextPage = page * limit < data.total_count;
			return {
				issues,
				totalCount: data.total_count,
				hasNextPage,
				page,
			};
		} catch (err) {
			console.warn(
				"[workspaceCreation.searchGitHubIssues] octokit fallback failed",
				err,
			);
			throw err;
		}
	});
