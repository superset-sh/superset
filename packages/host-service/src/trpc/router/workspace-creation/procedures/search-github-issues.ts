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

const ghIssueSchema = z.object({
	number: z.number(),
	title: z.string(),
	url: z.string(),
	state: z.string(),
	author: z.object({ login: z.string() }).nullable().optional(),
});

const ISSUE_JSON_FIELDS = "number,title,url,state,author";

function fromGhIssue(issue: z.infer<typeof ghIssueSchema>): IssueResult {
	return {
		issueNumber: issue.number,
		title: issue.title,
		url: issue.url,
		state: issue.state.toLowerCase(),
		authorLogin: issue.author?.login ?? null,
	};
}

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
			ISSUE_JSON_FIELDS,
		],
		{ cwd: repo.repoPath ?? undefined },
	);
	return fromGhIssue(ghIssueSchema.parse(raw));
}

async function ghSearch(
	execGh: ExecGh,
	repo: ResolvedGithubRepo,
	query: string,
	includeClosed: boolean,
	limit: number,
): Promise<IssueResult[]> {
	const args = [
		"issue",
		"list",
		"--repo",
		`${repo.owner}/${repo.name}`,
		"--state",
		includeClosed ? "all" : "open",
		"--limit",
		String(limit),
		"--json",
		ISSUE_JSON_FIELDS,
	];
	if (query) {
		args.push("--search", query);
	}
	const raw = await execGh(args, { cwd: repo.repoPath ?? undefined });
	const arr = z.array(ghIssueSchema).parse(raw);
	return arr.map(fromGhIssue);
}

export const searchGitHubIssues = protectedProcedure
	.input(githubSearchInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const limit = input.limit ?? 30;

		const raw = input.query?.trim() ?? "";
		const normalized = normalizeGitHubQuery(raw, repo, "issue");

		if (normalized.repoMismatch) {
			return {
				issues: [],
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
					return { issues: [] };
				}
				if (!input.includeClosed && issue.state !== "open") {
					return { issues: [] };
				}
				return { issues: [issue] };
			}
			const issues = await ghSearch(
				ctx.execGh,
				repo,
				effectiveQuery,
				input.includeClosed ?? false,
				limit,
			);
			return { issues };
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
					return { issues: [] };
				}
				if (!input.includeClosed && issue.state !== "open") {
					return { issues: [] };
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
				};
			}

			const stateFilter = input.includeClosed ? "" : " is:open";
			const query =
				`repo:${repo.owner}/${repo.name} is:issue${stateFilter} ${effectiveQuery}`.trim();
			const { data } = await octokit.search.issuesAndPullRequests({
				q: query,
				per_page: limit,
				sort: "updated",
				order: "desc",
			});
			return {
				issues: data.items
					.filter((item) => !item.pull_request)
					.map((item) => ({
						issueNumber: item.number,
						title: item.title,
						url: item.html_url,
						state: item.state,
						authorLogin: item.user?.login ?? null,
					})),
			};
		} catch (err) {
			console.warn(
				"[workspaceCreation.searchGitHubIssues] octokit fallback failed",
				err,
			);
			throw err;
		}
	});
