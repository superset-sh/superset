import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveProjectRepos } from "../shared/github-search";
import { resolveGithubRepo } from "../shared/project-helpers";

const getRepoContributorsInputSchema = z.object({
	projectId: z.string(),
	// Batch mode, same convention as searchPullRequests: fetch contributors
	// for every listed project's repo at once.
	projectIds: z.array(z.string()).min(1).max(50).optional(),
});

export interface RepoContributor {
	login: string;
	avatarUrl: string;
}

export const getRepoContributors = protectedProcedure
	.input(getRepoContributorsInputSchema)
	.query(async ({ ctx, input }): Promise<RepoContributor[]> => {
		const projectIds = input.projectIds ?? [input.projectId];
		const projectRepos = await resolveProjectRepos(
			projectIds,
			input.projectIds !== undefined,
			(projectId) => resolveGithubRepo(ctx, projectId),
		);
		if (projectRepos.length === 0) return [];

		const uniqueRepos = new Map(
			projectRepos.map(({ repo }) => [`${repo.owner}/${repo.name}`, repo]),
		);

		const octokit = await ctx.github();
		const settled = await Promise.allSettled(
			[...uniqueRepos.values()].map((repo) =>
				octokit.repos.listContributors({
					owner: repo.owner,
					repo: repo.name,
					per_page: 100,
				}),
			),
		);

		const byLogin = new Map<string, RepoContributor>();
		for (const result of settled) {
			if (result.status !== "fulfilled") continue;
			for (const contributor of result.value.data) {
				if (!contributor.login || !contributor.avatar_url) continue;
				const key = contributor.login.toLowerCase();
				if (!byLogin.has(key)) {
					byLogin.set(key, {
						login: contributor.login,
						avatarUrl: contributor.avatar_url,
					});
				}
			}
		}
		return [...byLogin.values()].sort((a, b) =>
			a.login.localeCompare(b.login, undefined, { sensitivity: "base" }),
		);
	});
