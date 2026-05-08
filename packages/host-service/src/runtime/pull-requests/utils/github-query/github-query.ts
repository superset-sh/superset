import type { Octokit } from "@octokit/rest";
import { PULL_REQUEST_FOR_BRANCH_QUERY } from "./query";
import type {
	GraphQLPullRequestNode,
	PullRequestForBranchGraphQLResult,
} from "./types";

export async function fetchPullRequestForBranch(
	octokit: Octokit,
	args: {
		owner: string;
		name: string;
		branch: string;
	},
): Promise<GraphQLPullRequestNode | null> {
	const result = await octokit.graphql<PullRequestForBranchGraphQLResult>(
		PULL_REQUEST_FOR_BRANCH_QUERY,
		{
			owner: args.owner,
			repo: args.name,
			branch: args.branch,
		},
	);

	const nodes = (result.repository?.pullRequests?.nodes ?? []).filter(
		(node): node is GraphQLPullRequestNode => node !== null,
	);

	return nodes[0] ?? null;
}
