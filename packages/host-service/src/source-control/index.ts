import type { Octokit } from "@octokit/rest";
import type { RepositoryIdentity } from "@superset/shared/source-control";
import { createGitHubClient } from "./github/github";
import type { GitLabClient } from "./gitlab/gitlab";

export function resolveSourceControlProvider(
	repository: RepositoryIdentity,
	providers: { github: () => Promise<Octokit>; gitlab: GitLabClient },
) {
	return repository.provider === "gitlab"
		? { provider: "gitlab" as const, repository, client: providers.gitlab }
		: {
				provider: "github" as const,
				repository,
				client: createGitHubClient(repository, providers.github),
			};
}
