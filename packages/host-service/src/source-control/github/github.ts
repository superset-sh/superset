import type { Octokit } from "@octokit/rest";
import type { RepositoryIdentity } from "@superset/shared/source-control";

export interface GitHubClient {
	api(): Promise<Octokit>;
	repository: RepositoryIdentity;
}

export function createGitHubClient(
	repository: RepositoryIdentity,
	github: () => Promise<Octokit>,
): GitHubClient {
	return { repository, api: github };
}
