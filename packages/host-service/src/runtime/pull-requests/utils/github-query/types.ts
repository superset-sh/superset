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

export interface GraphQLStatusContextNode {
	__typename: "StatusContext";
	context: string;
	state: string;
	targetUrl: string | null;
	createdAt: string | null;
}

export type GraphQLCheckContextNode =
	| GraphQLCheckRunNode
	| GraphQLStatusContextNode
	| null;

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
	statusCheckRollup: {
		contexts: {
			nodes: GraphQLCheckContextNode[];
		} | null;
	} | null;
}

export interface PullRequestsGraphQLResult {
	repository?: {
		pullRequests?: {
			nodes?: Array<GraphQLPullRequestNode | null>;
		};
	} | null;
}
