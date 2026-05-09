import type { Octokit } from "@octokit/rest";
import { PULL_REQUEST_CHECKS_QUERY, PULL_REQUESTS_LIST_QUERY } from "./query";
import type {
	GraphQLCheckContextNode,
	GraphQLPullRequestNode,
	PullRequestChecksGraphQLResult,
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
		PULL_REQUESTS_LIST_QUERY,
		{
			owner: repository.owner,
			repo: repository.name,
		},
	);

	return (result.repository?.pullRequests?.nodes ?? []).filter(
		(node): node is GraphQLPullRequestNode => node !== null,
	);
}

export async function fetchPullRequestChecks(
	octokit: Octokit,
	pr: {
		owner: string;
		name: string;
		number: number;
	},
): Promise<GraphQLCheckContextNode[]> {
	const result = await octokit.graphql<PullRequestChecksGraphQLResult>(
		PULL_REQUEST_CHECKS_QUERY,
		{
			owner: pr.owner,
			repo: pr.name,
			number: pr.number,
		},
	);

	return (
		result.repository?.pullRequest?.statusCheckRollup?.contexts?.nodes ?? []
	);
}
