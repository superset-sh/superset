/** Represents a GitHub Actions check run node returned by the GraphQL API. */
export interface GraphQLCheckRunNode {
	__typename: "CheckRun";
	name: string;
	conclusion: string | null;
	detailsUrl: string | null;
	status: string;
	startedAt: string | null;
	completedAt: string | null;
	checkSuite: {
		workflowRun: {
			databaseId: number | null;
		} | null;
	} | null;
}

/** Represents a commit status context node returned by the GraphQL API. */
export interface GraphQLStatusContextNode {
	__typename: "StatusContext";
	context: string;
	state: string;
	targetUrl: string | null;
	createdAt: string | null;
}

/** Union of possible check context nodes - either a CheckRun, a StatusContext, or null. */
export type GraphQLCheckContextNode =
	| GraphQLCheckRunNode
	| GraphQLStatusContextNode
	| null;

/** Shape of a single pull request node as returned by the GitHub GraphQL API. */
export interface GraphQLPullRequestNode {
	number: number;
	title: string;
	url: string;
	state: "OPEN" | "CLOSED" | "MERGED";
	isDraft: boolean;
	headRefName: string;
	headRefOid: string;
	reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
	updatedAt: string;
	mergeQueueEntry: { position: number } | null;
	statusCheckRollup: {
		contexts: {
			nodes: GraphQLCheckContextNode[];
		} | null;
	} | null;
}

/** Top-level shape of the GraphQL response for the pull requests query. */
export interface PullRequestsGraphQLResult {
	repository?: {
		pullRequests?: {
			nodes?: Array<GraphQLPullRequestNode | null>;
		};
	} | null;
}
