import type { Octokit } from "@octokit/rest";
import { z } from "zod";
import type { ExecGh } from "../../../trpc/router/workspace-creation/utils/exec-gh";
import type {
	IssueSearchFilters,
	IssueSummary,
	IssuesPage,
	PullRequestSearchFilters,
	PullRequestSummary,
	PullRequestsPage,
	SearchRepoRef,
} from "../types";
import { normalizeGitHubQuery } from "./normalize-github-query";

export interface GitHubSearchDeps {
	execGh: ExecGh;
	github: () => Promise<Octokit>;
}

// ─── PR helpers ──────────────────────────────────────────────────────────────

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

async function ghDirectLookupPr(
	execGh: ExecGh,
	repo: SearchRepoRef,
	prNumber: number,
): Promise<PullRequestSummary> {
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

async function ghApiSearchPullRequests(
	execGh: ExecGh,
	repo: SearchRepoRef,
	query: string,
	includeClosed: boolean,
	page: number,
	perPage: number,
): Promise<{
	items: PullRequestSummary[];
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
	const items: PullRequestSummary[] = parsed.items
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

// ─── Issue helpers ────────────────────────────────────────────────────────────

const ghIssueViewSchema = z.object({
	number: z.number(),
	title: z.string(),
	url: z.string(),
	state: z.string(),
	author: z.object({ login: z.string() }).nullable().optional(),
});

const ISSUE_VIEW_FIELDS = "number,title,url,state,author";

const issueSearchItemSchema = z.object({
	number: z.number(),
	title: z.string(),
	html_url: z.string(),
	state: z.string(),
	user: z.object({ login: z.string() }).nullable().optional(),
	pull_request: z.unknown().optional(),
});

const issueSearchResponseSchema = z.object({
	total_count: z.number(),
	items: z.array(issueSearchItemSchema),
});

async function ghDirectLookupIssue(
	execGh: ExecGh,
	repo: SearchRepoRef,
	issueNumber: number,
): Promise<IssueSummary> {
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

async function ghApiSearchIssues(
	execGh: ExecGh,
	repo: SearchRepoRef,
	query: string,
	includeClosed: boolean,
	page: number,
	perPage: number,
): Promise<{
	items: IssueSummary[];
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
	const parsed = issueSearchResponseSchema.parse(raw);
	const items: IssueSummary[] = parsed.items
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

// ─── Entry functions ──────────────────────────────────────────────────────────

export async function searchPullRequestsGitHub(
	deps: GitHubSearchDeps,
	repo: SearchRepoRef,
	filters: PullRequestSearchFilters,
): Promise<PullRequestsPage> {
	const limit = filters.limit ?? 30;
	const page = filters.page ?? 1;

	const raw = filters.text?.trim() ?? "";
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
			const pr = await ghDirectLookupPr(deps.execGh, repo, prNumber);
			return {
				pullRequests: [pr],
				totalCount: 1,
				hasNextPage: false,
				page,
			};
		}
		const result = await ghApiSearchPullRequests(
			deps.execGh,
			repo,
			effectiveQuery,
			filters.includeClosed ?? false,
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

	const octokit = await deps.github();

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

		const stateFilter = filters.includeClosed ? "" : " is:open";
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
}

export async function searchIssuesGitHub(
	deps: GitHubSearchDeps,
	repo: SearchRepoRef,
	filters: IssueSearchFilters,
): Promise<IssuesPage> {
	const limit = filters.limit ?? 30;
	const page = filters.page ?? 1;

	const raw = filters.text?.trim() ?? "";
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
			const issue = await ghDirectLookupIssue(deps.execGh, repo, issueNumber);
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
			deps.execGh,
			repo,
			effectiveQuery,
			filters.includeClosed ?? false,
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

	const octokit = await deps.github();

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

		const stateFilter = filters.includeClosed ? "" : " is:open";
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
}
