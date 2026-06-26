export interface GitHubCheckRunNode {
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

export interface GitHubStatusContextNode {
	__typename: "StatusContext";
	context: string;
	state: string;
	targetUrl: string | null;
	createdAt: string | null;
}

export type GitHubCheckContextNode =
	| GitHubCheckRunNode
	| GitHubStatusContextNode
	| null;

export interface GitHubPullRequestNode {
	number: number;
	title: string;
	url: string;
	state: "OPEN" | "CLOSED" | "MERGED";
	isDraft: boolean;
	headRefName: string;
	headRefOid: string;
	/**
	 * True when the head ref is the head repository's default branch (trunk).
	 * A PR whose head is trunk is anomalous; once merged/closed it must not be
	 * surfaced as the default-branch workspace's PR status. See #4998.
	 */
	isHeadDefaultBranch: boolean;
	isCrossRepository: boolean;
	headRepositoryOwner: { login: string } | null;
	headRepository: { name: string } | null;
	updatedAt: string;
}

export type GitHubPullRequestReviewDecision =
	| "APPROVED"
	| "CHANGES_REQUESTED"
	| "REVIEW_REQUIRED"
	| null;

export interface GitHubPullRequestHeadRef {
	owner: string;
	repo: string;
	branch: string;
}
