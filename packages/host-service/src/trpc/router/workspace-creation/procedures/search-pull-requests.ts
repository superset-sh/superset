import { protectedProcedure } from "../../../index";
import { normalizeGitHubQuery } from "../normalize-github-query";
import { githubSearchInputSchema } from "../schemas";
import { resolveGithubRepo } from "../shared/project-helpers";

function normalizePullRequestState(
	state: string,
	mergedAt: string | null | undefined,
): "open" | "closed" | "merged" {
	if (mergedAt) return "merged";
	return state.toLowerCase() === "closed" ? "closed" : "open";
}

export const searchPullRequests = protectedProcedure
	.input(githubSearchInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const limit = input.limit ?? 30;

		// Normalize the query: detect GitHub PR URLs, strip `#` shorthand
		const raw = input.query?.trim() ?? "";
		const normalized = normalizeGitHubQuery(raw, repo, "pull");

		if (normalized.repoMismatch) {
			return {
				pullRequests: [],
				repoMismatch: `${repo.owner}/${repo.name}`,
			};
		}

		const effectiveQuery = normalized.query;
		const octokit = await ctx.github();

		try {
			// Direct lookup by PR number (from URL paste or `#123` shorthand)
			if (normalized.isDirectLookup) {
				const prNumber = Number.parseInt(effectiveQuery, 10);
				const { data: pr } = await octokit.pulls.get({
					owner: repo.owner,
					repo: repo.name,
					pull_number: prNumber,
				});
				const state = normalizePullRequestState(pr.state, pr.merged_at);
				if (!input.includeClosed && state !== "open") {
					return { pullRequests: [] };
				}
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
			console.warn("[workspaceCreation.searchPullRequests] failed", err);
			return { pullRequests: [] };
		}
	});
