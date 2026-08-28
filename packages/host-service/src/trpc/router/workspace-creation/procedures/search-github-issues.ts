import type { Octokit } from "@octokit/rest";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { normalizeGitHubQuery } from "../normalize-github-query";
import { githubSearchInputSchema } from "../schemas";
import {
	buildSearchQuery,
	chunkProjectRepos,
	formatRepoList,
	githubRateLimitError,
	githubRequestError,
	isGithubNotFoundError,
	isGithubRateLimitError,
	mergeByUpdatedAtDesc,
	type ProjectRepo,
	projectIdForSearchItem,
	resolveProjectRepos,
} from "../shared/github-search";
import { resolveGithubRepo } from "../shared/project-helpers";
import type { ExecGh } from "../utils/exec-gh";

interface IssueResult {
	projectId: string;
	issueNumber: number;
	title: string;
	url: string;
	state: string;
	authorLogin: string | null;
	updatedAt: string | null;
}

export interface IssuesPage {
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
	updatedAt: z.string().nullable().optional(),
});

const ISSUE_VIEW_FIELDS = "number,title,url,state,author,updatedAt";

/**
 * Direct-lookup an issue in one repo. Returns null when the number is a
 * PR: `gh issue view <n>` happily returns a PR since GitHub's API surface
 * treats PRs as a kind of issue, and the canonical URL is the only signal
 * we have over `gh` (Octokit's path filters via `issue.pull_request`).
 */
async function ghDirectLookup(
	execGh: ExecGh,
	target: ProjectRepo,
	issueNumber: number,
): Promise<IssueResult | null> {
	const { repo } = target;
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
	if (issue.url.includes("/pull/")) return null;
	return {
		projectId: target.projectId,
		issueNumber: issue.number,
		title: issue.title,
		url: issue.url,
		state: issue.state.toLowerCase(),
		authorLogin: issue.author?.login ?? null,
		updatedAt: issue.updatedAt ?? null,
	};
}

/** Octokit twin of {@link ghDirectLookup}; null = the number is a PR. */
async function octokitDirectLookup(
	octokit: Octokit,
	target: ProjectRepo,
	issueNumber: number,
): Promise<IssueResult | null> {
	const { repo } = target;
	const { data: issue } = await octokit.issues.get({
		owner: repo.owner,
		repo: repo.name,
		issue_number: issueNumber,
	});
	if (issue.pull_request) return null;
	return {
		projectId: target.projectId,
		issueNumber: issue.number,
		title: issue.title,
		url: issue.html_url,
		state: issue.state,
		authorLogin: issue.user?.login ?? null,
		updatedAt: issue.updated_at ?? null,
	};
}

const searchIssuesItemSchema = z.object({
	number: z.number(),
	title: z.string(),
	html_url: z.string(),
	state: z.string(),
	user: z.object({ login: z.string() }).nullable().optional(),
	pull_request: z.unknown().optional(),
	updated_at: z.string().optional(),
	repository_url: z.string().optional(),
});

const searchIssuesResponseSchema = z.object({
	total_count: z.number(),
	items: z.array(searchIssuesItemSchema),
});

async function ghApiSearchIssues(
	execGh: ExecGh,
	chunk: ProjectRepo[],
	qualifiers: string,
	page: number,
	perPage: number,
): Promise<{
	items: IssueResult[];
	totalCount: number;
	hasNextPage: boolean;
}> {
	const q = buildSearchQuery(chunk, qualifiers);
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
	const raw = await execGh(args, { cwd: chunk[0]?.repo.repoPath });
	const parsed = searchIssuesResponseSchema.parse(raw);
	const items: IssueResult[] = parsed.items
		.filter((item) => !item.pull_request)
		.flatMap((item): IssueResult[] => {
			const projectId = projectIdForSearchItem(chunk, item.repository_url);
			if (!projectId) return [];
			return [
				{
					projectId,
					issueNumber: item.number,
					title: item.title,
					url: item.html_url,
					state: item.state.toLowerCase(),
					authorLogin: item.user?.login ?? null,
					updatedAt: item.updated_at ?? null,
				},
			];
		});
	const hasNextPage = page * perPage < parsed.total_count;
	return { items, totalCount: parsed.total_count, hasNextPage };
}

async function octokitSearchIssues(
	octokit: Octokit,
	chunk: ProjectRepo[],
	qualifiers: string,
	page: number,
	perPage: number,
): Promise<{
	items: IssueResult[];
	totalCount: number;
	hasNextPage: boolean;
}> {
	const { data } = await octokit.search.issuesAndPullRequests({
		q: buildSearchQuery(chunk, qualifiers),
		per_page: perPage,
		page,
		sort: "updated",
		order: "desc",
	});
	const items: IssueResult[] = data.items
		.filter((item) => !item.pull_request)
		.flatMap((item): IssueResult[] => {
			const projectId = projectIdForSearchItem(chunk, item.repository_url);
			if (!projectId) return [];
			return [
				{
					projectId,
					issueNumber: item.number,
					title: item.title,
					url: item.html_url,
					state: item.state,
					authorLogin: item.user?.login ?? null,
					updatedAt: item.updated_at ?? null,
				},
			];
		});
	const hasNextPage = page * perPage < data.total_count;
	return { items, totalCount: data.total_count, hasNextPage };
}

export const searchGitHubIssues = protectedProcedure
	.input(githubSearchInputSchema)
	.query(async ({ ctx, input }): Promise<IssuesPage> => {
		const projectIds = input.projectIds ?? [input.projectId];
		const projectRepos: ProjectRepo[] = await resolveProjectRepos(
			projectIds,
			input.projectIds !== undefined,
			(projectId) => resolveGithubRepo(ctx, projectId),
		);
		const limit = input.limit ?? 30;
		const page = input.page ?? 1;
		if (projectRepos.length === 0) {
			return { issues: [], totalCount: 0, hasNextPage: false, page };
		}

		const raw = input.query?.trim() ?? "";
		const normalizedTargets = projectRepos.map((projectRepo) => ({
			projectRepo,
			normalized: normalizeGitHubQuery(raw, projectRepo.repo, "issue"),
		}));
		const directEntries = normalizedTargets.filter(
			({ normalized }) => normalized.isDirectLookup,
		);
		const directTargets = directEntries.map(({ projectRepo }) => projectRepo);

		// A same-kind GitHub URL either direct-matches a repo or mismatches
		// it, so no direct target + any mismatch ⇒ every repo mismatched.
		if (
			directTargets.length === 0 &&
			normalizedTargets.some(({ normalized }) => normalized.repoMismatch)
		) {
			return {
				issues: [],
				totalCount: 0,
				hasNextPage: false,
				page,
				repoMismatch: formatRepoList(projectRepos),
			};
		}

		const lookupNumber = directEntries[0]
			? Number.parseInt(directEntries[0].normalized.query, 10)
			: null;

		const effectiveQuery = normalizedTargets[0]?.normalized.query ?? "";
		const qualifiers = [
			"is:issue",
			input.includeClosed ? "" : "is:open",
			effectiveQuery,
		]
			.filter(Boolean)
			.join(" ");

		try {
			if (lookupNumber !== null) {
				const single = directTargets.length === 1 ? directTargets[0] : null;
				if (single) {
					const issue = await ghDirectLookup(ctx.execGh, single, lookupNumber);
					return {
						issues: issue ? [issue] : [],
						totalCount: issue ? 1 : 0,
						hasNextPage: false,
						page,
					};
				}
				// Bare `#N` fans out one `gh issue view` per repo — core quota,
				// not search quota. Repos without that number just miss.
				const settled = await Promise.allSettled(
					directTargets.map((target) =>
						ghDirectLookup(ctx.execGh, target, lookupNumber),
					),
				);
				const found: IssueResult[] = [];
				for (const result of settled) {
					if (result.status === "fulfilled") {
						if (result.value) found.push(result.value);
					} else if (!isGithubNotFoundError(result.reason)) {
						throw result.reason;
					}
				}
				return {
					issues: mergeByUpdatedAtDesc([found]),
					totalCount: found.length,
					hasNextPage: false,
					page,
				};
			}

			const chunks = chunkProjectRepos(projectRepos, qualifiers);
			const chunkResults = await Promise.all(
				chunks.map((chunk) =>
					ghApiSearchIssues(ctx.execGh, chunk, qualifiers, page, limit),
				),
			);
			return {
				issues: mergeByUpdatedAtDesc(
					chunkResults.map((result) => result.items),
				),
				totalCount: chunkResults.reduce(
					(sum, result) => sum + result.totalCount,
					0,
				),
				hasNextPage: chunkResults.some((result) => result.hasNextPage),
				page,
			};
		} catch (ghErr) {
			// A rate-limited gh call surfaces as-is — falling back to Octokit
			// would retry against the same user's quota.
			if (isGithubRateLimitError(ghErr)) throw githubRateLimitError(ghErr);
			console.warn(
				"[workspaceCreation.searchGitHubIssues] gh path failed; falling back to Octokit",
				ghErr,
			);
		}

		const octokit = await ctx.github();

		try {
			if (lookupNumber !== null) {
				const single = directTargets.length === 1 ? directTargets[0] : null;
				if (single) {
					const issue = await octokitDirectLookup(
						octokit,
						single,
						lookupNumber,
					);
					return {
						issues: issue ? [issue] : [],
						totalCount: issue ? 1 : 0,
						hasNextPage: false,
						page,
					};
				}
				const settled = await Promise.allSettled(
					directTargets.map((target) =>
						octokitDirectLookup(octokit, target, lookupNumber),
					),
				);
				const found: IssueResult[] = [];
				for (const result of settled) {
					if (result.status === "fulfilled") {
						if (result.value) found.push(result.value);
					} else if (!isGithubNotFoundError(result.reason)) {
						throw result.reason;
					}
				}
				return {
					issues: mergeByUpdatedAtDesc([found]),
					totalCount: found.length,
					hasNextPage: false,
					page,
				};
			}

			const chunks = chunkProjectRepos(projectRepos, qualifiers);
			const chunkResults = await Promise.all(
				chunks.map((chunk) =>
					octokitSearchIssues(octokit, chunk, qualifiers, page, limit),
				),
			);
			return {
				issues: mergeByUpdatedAtDesc(
					chunkResults.map((result) => result.items),
				),
				totalCount: chunkResults.reduce(
					(sum, result) => sum + result.totalCount,
					0,
				),
				hasNextPage: chunkResults.some((result) => result.hasNextPage),
				page,
			};
		} catch (err) {
			console.warn(
				"[workspaceCreation.searchGitHubIssues] octokit fallback failed",
				err,
			);
			throw githubRequestError(err, ctx.credentials);
		}
	});
