import type {
	DiffSide,
	IssueComment,
	PullRequestReviewThread,
} from "../../trpc/router/git/types";
import type {
	PullRequestCheck as BasePullRequestCheck,
	ChecksStatus,
	PullRequestState,
	ReviewDecision,
} from "../pull-requests/utils/pull-request-mappers/pull-request-mappers";

export type GitProvider = "github" | "gitlab";

export interface RepoRef {
	owner: string;
	name: string;
}

export interface PullRequestHeadRef {
	owner: string;
	repo: string;
	branch: string;
}

export type { ChecksStatus, PullRequestState, ReviewDecision };
export interface PullRequestCheck extends BasePullRequestCheck {
	startedAt?: string | null;
	completedAt?: string | null;
}
export type ReviewThread = PullRequestReviewThread;
export type ConversationComment = IssueComment;
export type { DiffSide };

export interface RepoProviderIdentity {
	readonly provider: GitProvider;
	readonly host: string;
}

export interface PullRequestNode {
	number: number;
	title: string;
	url: string;
	state: "OPEN" | "CLOSED" | "MERGED";
	isDraft: boolean;
	headRefName: string;
	headRefOid: string;
	isCrossRepository: boolean;
	headRepositoryOwner: { login: string } | null;
	headRepository: { name: string } | null;
	updatedAt: string;
	mergedAt: number | null;
}

export interface CheckRun {
	databaseId?: number;
	createdAt?: string | null;
	kind: "check";
	name: string;
	status: string;
	conclusion: string | null;
	detailsUrl: string | null;
	startedAt: string | null;
	completedAt: string | null;
	runGroupId: number | null;
}

export interface StatusCheck {
	databaseId?: number;
	runGroupId?: number | null;
	completedAt?: string | null;
	kind: "status";
	context: string;
	state: string;
	targetUrl: string | null;
	createdAt: string | null;
}

export type CheckContextNode = CheckRun | StatusCheck | null;

export type ReviewDecisionRaw =
	| "APPROVED"
	| "CHANGES_REQUESTED"
	| "REVIEW_REQUIRED"
	| null;

export type GitLabDetailedMergeStatus = string;

export type NormalizedReviewState =
	| { provider: "github"; reviewDecision: ReviewDecisionRaw }
	| {
			provider: "gitlab";
			state?: string;
			detailedMergeStatus: GitLabDetailedMergeStatus;
			approvalsRequired: number | null;
			approvalsLeft: number | null;
			approvedBy: string[];
			blockingDiscussionsResolved: boolean;
			hasConflicts: boolean;
	  };

export interface MergeResult {
	sha: string;
	merged: boolean;
	message: string;
}

export interface PullRequestCheckoutMetadata {
	provider?: GitProvider;
	host?: string;
	headRepositoryUrl?: string | null;
	number: number;
	url: string;
	title: string;
	headRefName: string;
	headRefOid: string;
	baseRefName: string;
	headRepositoryOwner: string;
	headRepositoryName: string;
	isCrossRepository: boolean;
	state: "open" | "closed" | "merged";
}

export interface RepoRuntimeClient extends RepoProviderIdentity {
	fetchPullRequestByHead(
		repo: RepoRef,
		head: PullRequestHeadRef,
	): Promise<PullRequestNode | null>;
	fetchReviewState(
		repo: RepoRef,
		prNumber: number,
		prState: PullRequestState,
	): Promise<NormalizedReviewState>;
	fetchChecks(repo: RepoRef, headSha: string): Promise<CheckContextNode[]>;
	mergePullRequest(
		repo: RepoRef,
		prNumber: number,
		method: "merge" | "squash" | "rebase",
		options?: { commitMessage?: string; squash?: boolean },
	): Promise<MergeResult>;
	fetchPullRequestMetadata(
		repo: RepoRef,
		prNumber: number,
	): Promise<PullRequestCheckoutMetadata>;
}

export interface RepoIdentityClient extends RepoProviderIdentity {
	getAuthenticatedUser(): Promise<{ login: string } | null>;
}

export interface SearchRepoRef extends RepoRef {
	repoPath?: string | null;
}

export interface GitLabPullRequestSearchFilters {
	author?: string[];
	review?:
		| "none"
		| "required"
		| "approved"
		| "changes-requested"
		| "reviewed-by-me"
		| "not-reviewed-by-me"
		| "review-requested"
		| "team-review-requested";
	viewerRelationship?: "needs-review" | "reviewed" | "authored";
}

export interface PullRequestSearchFilters {
	gitlab?: GitLabPullRequestSearchFilters;
	text?: string;
	includeClosed?: boolean;
	mergedOnly?: boolean;
	page?: number;
	limit?: number;
}
export type IssueSearchFilters = PullRequestSearchFilters;

export interface PullRequestSummary {
	prNumber: number;
	title: string;
	url: string;
	state: "open" | "closed" | "merged";
	isDraft: boolean;
	authorLogin: string | null;
	updatedAt: string | null;
	checks: PullRequestCheck[];
	checksStatus: ChecksStatus;
	headRefName: string | null;
	additions: number | null;
	deletions: number | null;
}
export interface PullRequestsPage {
	pullRequests: PullRequestSummary[];
	totalCount: number;
	hasNextPage: boolean;
	page: number;
	repoMismatch?: string;
}

export interface IssueSummary {
	issueNumber: number;
	title: string;
	url: string;
	state: string;
	authorLogin: string | null;
	updatedAt: string | null;
}
export interface IssuesPage {
	issues: IssueSummary[];
	totalCount: number;
	hasNextPage: boolean;
	page: number;
	repoMismatch?: string;
}

export interface RepoSearchClient extends RepoProviderIdentity {
	searchPullRequests(
		repo: SearchRepoRef,
		filters: PullRequestSearchFilters,
	): Promise<PullRequestsPage>;
	searchIssues(
		repo: SearchRepoRef,
		filters: IssueSearchFilters,
	): Promise<IssuesPage>;
}

export interface NormalizedPullRequestContent {
	number: number;
	title: string;
	body: string;
	url: string;
	state: string;
	branch: string;
	baseBranch: string;
	headRepositoryOwner: string | null;
	isCrossRepository: boolean;
	author: string | null;
	isDraft: boolean;
	createdAt: string | undefined;
	updatedAt: string | undefined;

	checks: PullRequestCheck[];
	checksStatus: ChecksStatus;
}

export interface NormalizedIssueContent {
	number: number;
	title: string;
	body: string;
	url: string;
	state: string;
	author: string | null;
	createdAt: string | undefined;
	updatedAt: string | undefined;
}

export interface RepoContentClient extends RepoProviderIdentity {
	fetchPullRequestContent(
		repo: RepoRef,
		prNumber: number,
	): Promise<NormalizedPullRequestContent>;
	fetchIssueContent(
		repo: RepoRef,
		issueNumber: number,
	): Promise<NormalizedIssueContent>;
}

export interface RepoReviewClient extends RepoProviderIdentity {
	fetchReviewThreads(
		repo: RepoRef,
		prNumber: number,
	): Promise<{
		reviewThreads: ReviewThread[];
		conversationComments: ConversationComment[];
	}>;
	setReviewThreadResolution(threadId: string, resolved: boolean): Promise<void>;
	replyToReviewThread(threadId: string, body: string): Promise<void>;
}

export type RepoProviderClient = RepoProviderIdentity &
	RepoRuntimeClient &
	RepoSearchClient &
	RepoContentClient &
	RepoReviewClient &
	RepoActionsClient &
	RepoIdentityClient;

export interface PullRequestCapabilities {
	merge: boolean;
	close: boolean;
	reopen: boolean;
	markReady: boolean;
	updateBranch: boolean;
	dequeue: boolean;
	mergePolicy:
		| {
				provider: "github";
				allowedMethods: Array<"merge" | "squash" | "rebase">;
		  }
		| {
				provider: "gitlab";
				method: "merge" | "rebase_merge" | "ff";
				squash: "never" | "always" | "default_on" | "default_off";
				squashEnabled?: boolean;
		  };
}
export interface CreatePullRequestInput {
	title: string;
	body?: string;
	draft?: boolean;
	head: PullRequestHeadRef;
	base: string;
}
export interface RepoActionsClient extends RepoProviderIdentity {
	fetchPullRequestDiff(repo: RepoRef, prNumber: number): Promise<string>;
	pullRequestCapabilities(
		repo: RepoRef,
		prNumber: number,
	): Promise<PullRequestCapabilities>;
	createPullRequest(
		repo: RepoRef,
		input: CreatePullRequestInput,
	): Promise<{ number: number; url: string }>;
	setPullRequestState(
		repo: RepoRef,
		prNumber: number,
		state: "open" | "closed",
	): Promise<void>;
	reopenPullRequest(repo: RepoRef, prNumber: number): Promise<void>;
	markPullRequestReady(repo: RepoRef, prNumber: number): Promise<void>;
	updatePullRequestBranch(repo: RepoRef, prNumber: number): Promise<void>;
	dequeuePullRequest(repo: RepoRef, prNumber: number): Promise<void>;
}
