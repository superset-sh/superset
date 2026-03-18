import type { Octokit } from "@octokit/rest";
import { PULL_REQUESTS_QUERY } from "./query";
import type {
	GraphQLPullRequestNode,
	PullRequestsGraphQLResult,
} from "./types";

export async function fetchRepositoryPullRequests(
	octokit: Octokit,
	repository: {
		owner: string;
		name: string;
	},
): Promise<GraphQLPullRequestNode[]> {
	const result = await octokit.graphql<PullRequestsGraphQLResult>(
		PULL_REQUESTS_QUERY,
		{
			owner: repository.owner,
			repo: repository.name,
		},
	);

	return (result.repository?.pullRequests?.nodes ?? []).filter(
		(node): node is GraphQLPullRequestNode => node !== null,
	);
}
