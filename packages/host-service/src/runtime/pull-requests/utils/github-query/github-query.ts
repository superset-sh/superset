import type { Octokit } from "@octokit/rest";
import { PULL_REQUESTS_QUERY } from "./query";
import type {
	GraphQLPullRequestNode,
	PullRequestsGraphQLResult,
	RepositoryPullRequestsResult,
} from "./types";

export async function fetchRepositoryPullRequests(
	octokit: Octokit,
	repository: {
		owner: string;
		name: string;
	},
): Promise<RepositoryPullRequestsResult> {
	const result = await octokit.graphql<PullRequestsGraphQLResult>(
		PULL_REQUESTS_QUERY,
		{
			owner: repository.owner,
			repo: repository.name,
		},
	);

	const nodes = (result.repository?.pullRequests?.nodes ?? []).filter(
		(node): node is GraphQLPullRequestNode => node !== null,
	);

	return {
		defaultBranch: result.repository?.defaultBranchRef?.name ?? null,
		nodes,
	};
}
