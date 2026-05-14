import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { normalizeGitHubQuery } from "../normalize-github-query";
import { githubSearchInputSchema } from "../schemas";
import {
	type ResolvedGithubRepo,
	resolveGithubRepo,
} from "../shared/project-helpers";
import type { ExecGh } from "../utils/exec-gh";

interface PullRequestResult {
	prNumber: number;
	title: string;
	url: string;
	state: "open" | "closed" | "merged";
	isDraft: boolean;
	authorLogin: string | null;
}

interface PullRequestsPage {
	pullRequests: PullRequestResult[];
	totalCount: number;
	hasNextPage: boolean;
	page: number;
	repoMismatch?: string;
}

function normalizePullRequestState(
	state: string,
	mergedAt: string | null | undefined,
): "open" | "closed" | "merged" {
	if (mergedAt) return "merged";
	return state.toLowerCase() === "closed" ? "closed" : "open";
}

const ghPrViewSchema = z.object({
	number: z.number(),
	title: z.string(),
	url: z.string(),
	state: z.string(),
	isDraft: z.boolean().optional(),
	author: z.object({ login: z.string() }).nullable().optional(),
	mergedAt: z.string().nullable().optional(),
});

const PR_VIEW_FIELDS = "number,title,url,state,isDraft,author,mergedAt";

async function ghDirectLookup(
	execGh: ExecGh,
	repo: ResolvedGithubRepo,
	prNumber: number,
): Promise<PullRequestResult> {
	const raw = await execGh(
		[
			"pr",
			"view",
			String(prNumber),
			"--repo",
			`${repo.owner}/${repo.name}`,
			"--json",
			PR_VIEW_FIELDS,
		],
		{ cwd: repo.repoPath ?? undefined },
	);
	const pr = ghPrViewSchema.parse(raw);
	return {
		prNumber: pr.number,
		title: pr.title,
		url: pr.url,
		state: normalizePullRequestState(pr.state, pr.mergedAt),
		isDraft: pr.isDraft ?? false,
		authorLogin: pr.author?.login ?? null,
	};
}

const searchIssuesItemSchema = z.object({
	number: z.number(),
	title: z.string(),
	html_url: z.string(),
	state: z.string(),
	draft: z.boolean().optional(),
	user: z.object({ login: z.string() }).nullable().optional(),
	pull_request: z
		.object({
			merged_at: z.string().nullable().optional(),
		})
		.optional(),
});

const searchIssuesResponseSchema = z.object({
	total_count: z.number(),
	items: z.array(searchIssuesItemSchema),
});

async function ghApiSearchPullRequests(
	execGh: ExecGh,
	repo: ResolvedGithubRepo,
	query: string,
	includeClosed: boolean,
	page: number,
	perPage: number,
): Promise<{
	items: PullRequestResult[];
	totalCount: number;
	hasNextPage: boolean;
}> {
	const stateFilter = includeClosed ? "" : " is:open";
	const q =
		`repo:${repo.owner}/${repo.name} is:pr${stateFilter}${query ? ` ${query}` : ""}`.trim();
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
	const items: PullRequestResult[] = parsed.items
		.filter((item) => !!item.pull_request)
		.map((item) => ({
			prNumber: item.number,
			title: item.title,
			url: item.html_url,
			state: normalizePullRequestState(
				item.state,
				item.pull_request?.merged_at,
			),
			isDraft: item.draft ?? false,
			authorLogin: item.user?.login ?? null,
		}));
	const hasNextPage = page * perPage < parsed.total_count;
	return { items, totalCount: parsed.total_count, hasNextPage };
}

export const searchPullRequests = protectedProcedure
	.input(githubSearchInputSchema)
	.query(async ({ ctx, input }): Promise<PullRequestsPage> => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const limit = input.limit ?? 30;
		const page = input.page ?? 1;

		const raw = input.query?.trim() ?? "";
		const normalized = normalizeGitHubQuery(raw, repo, "pull");

		if (normalized.repoMismatch) {
			return {
				pullRequests: [],
				totalCount: 0,
				hasNextPage: false,
				page,
				repoMismatch: `${repo.owner}/${repo.name}`,
			};
		}

		const effectiveQuery = normalized.query;

		// gh-first uses the user's local `gh auth login`; falls back to
		// Octokit when gh is missing, unauthed, or errors.
		try {
			if (normalized.isDirectLookup) {
				const prNumber = Number.parseInt(effectiveQuery, 10);
				const pr = await ghDirectLookup(ctx.execGh, repo, prNumber);
				return {
					pullRequests: [pr],
					totalCount: 1,
					hasNextPage: false,
					page,
				};
			}
			const result = await ghApiSearchPullRequests(
				ctx.execGh,
				repo,
				effectiveQuery,
				input.includeClosed ?? false,
				page,
				limit,
			);
			return {
				pullRequests: result.items,
				totalCount: result.totalCount,
				hasNextPage: result.hasNextPage,
				page,
			};
		} catch (ghErr) {
			console.warn(
				"[workspaceCreation.searchPullRequests] gh path failed; falling back to Octokit",
				ghErr,
			);
		}

		const octokit = await ctx.github();

		try {
			if (normalized.isDirectLookup) {
				const prNumber = Number.parseInt(effectiveQuery, 10);
				const { data: pr } = await octokit.pulls.get({
					owner: repo.owner,
					repo: repo.name,
					pull_number: prNumber,
				});
				const state = normalizePullRequestState(pr.state, pr.merged_at);
				return {
					pullRequests: [
						{
							prNumber: pr.number,
							title: pr.title,
							url: pr.html_url,
							state,
							isDraft: pr.draft ?? false,
							authorLogin: pr.user?.login ?? null,
						},
					],
					totalCount: 1,
					hasNextPage: false,
					page,
				};
			}

			const stateFilter = input.includeClosed ? "" : " is:open";
			const query =
				`repo:${repo.owner}/${repo.name} is:pr${stateFilter} ${effectiveQuery}`.trim();
			const { data } = await octokit.search.issuesAndPullRequests({
				q: query,
				per_page: limit,
				page,
				sort: "updated",
				order: "desc",
			});
			const pullRequests = data.items
				.filter((item) => item.pull_request)
				.map((item) => {
					const state = normalizePullRequestState(
						item.state,
						item.pull_request?.merged_at,
					);
					return {
						prNumber: item.number,
						title: item.title,
						url: item.html_url,
						state,
						isDraft: item.draft ?? false,
						authorLogin: item.user?.login ?? null,
					};
				});
			const hasNextPage = page * limit < data.total_count;
			return {
				pullRequests,
				totalCount: data.total_count,
				hasNextPage,
				page,
			};
		} catch (err) {
			// Both gh and Octokit failed — rethrow so the renderer's toast
			// fires instead of the dropdown silently rendering "no results".
			console.warn(
				"[workspaceCreation.searchPullRequests] octokit fallback failed",
				err,
			);
			throw err;
		}
	});
