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

function normalizePullRequestState(
	state: string,
	mergedAt: string | null | undefined,
): "open" | "closed" | "merged" {
	if (mergedAt) return "merged";
	return state.toLowerCase() === "closed" ? "closed" : "open";
}

const ghPrSchema = z.object({
	number: z.number(),
	title: z.string(),
	url: z.string(),
	state: z.string(),
	isDraft: z.boolean().optional(),
	author: z.object({ login: z.string() }).nullable().optional(),
	mergedAt: z.string().nullable().optional(),
});

function fromGhPr(pr: z.infer<typeof ghPrSchema>): PullRequestResult {
	return {
		prNumber: pr.number,
		title: pr.title,
		url: pr.url,
		state: normalizePullRequestState(pr.state, pr.mergedAt),
		isDraft: pr.isDraft ?? false,
		authorLogin: pr.author?.login ?? null,
	};
}

const PR_JSON_FIELDS = "number,title,url,state,isDraft,author,mergedAt";

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
			PR_JSON_FIELDS,
		],
		{ cwd: repo.repoPath ?? undefined },
	);
	return fromGhPr(ghPrSchema.parse(raw));
}

async function ghSearch(
	execGh: ExecGh,
	repo: ResolvedGithubRepo,
	query: string,
	includeClosed: boolean,
	limit: number,
): Promise<PullRequestResult[]> {
	const args = [
		"pr",
		"list",
		"--repo",
		`${repo.owner}/${repo.name}`,
		"--state",
		includeClosed ? "all" : "open",
		"--limit",
		String(limit),
		"--json",
		PR_JSON_FIELDS,
	];
	if (query) {
		args.push("--search", query);
	}
	const raw = await execGh(args, { cwd: repo.repoPath ?? undefined });
	const arr = z.array(ghPrSchema).parse(raw);
	return arr.map(fromGhPr);
}

export const searchPullRequests = protectedProcedure
	.input(githubSearchInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const limit = input.limit ?? 30;

		const raw = input.query?.trim() ?? "";
		const normalized = normalizeGitHubQuery(raw, repo, "pull");

		if (normalized.repoMismatch) {
			return {
				pullRequests: [],
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
				return { pullRequests: [pr] };
			}
			const pullRequests = await ghSearch(
				ctx.execGh,
				repo,
				effectiveQuery,
				input.includeClosed ?? false,
				limit,
			);
			return { pullRequests };
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
				};
			}

			const stateFilter = input.includeClosed ? "" : " is:open";
			const query =
				`repo:${repo.owner}/${repo.name} is:pr${stateFilter} ${effectiveQuery}`.trim();
			const { data } = await octokit.search.issuesAndPullRequests({
				q: query,
				per_page: limit,
				sort: "updated",
				order: "desc",
			});
			return {
				pullRequests: data.items
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
					}),
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
