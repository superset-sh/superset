import type {
	DiffSide,
	IssueComment,
	PullRequestReviewThread,
} from "../../trpc/router/git/types";
import type {
	GitHubCheckContextNode,
	GitHubPullRequestNode,
	GitHubPullRequestReviewDecision,
} from "../pull-requests/utils/github-query";
import type {
	ChecksStatus,
	PullRequestCheck,
	PullRequestState,
	ReviewDecision,
} from "../pull-requests/utils/pull-request-mappers/pull-request-mappers";

/** Providers with a first-class client. ("unknown" hosts are resolved upstream.) */
export type GitProvider = "github" | "gitlab";

/** Identifies a repo within a provider+host. The client is already bound to provider+host. */
export interface RepoRef {
	owner: string;
	name: string;
}

/** A PR/MR head ref, possibly in a fork (cross-repository). */
export interface PullRequestHeadRef {
	owner: string;
	repo: string;
	branch: string;
}

// Neutral DTO names over the existing normalized shapes. Capability sub-phases
// (2b-2e) return these. Re-exporting keeps a single source of truth.
export type {
	ChecksStatus,
	PullRequestCheck,
	PullRequestState,
	ReviewDecision,
};
export type ReviewThread = PullRequestReviewThread;
export type ConversationComment = IssueComment;
export type { DiffSide };

/**
 * Identity-only base: just provider + host. All capability interfaces extend this
 * so callers can always read provider/host from any client.
 */
export interface RepoProviderIdentity {
	readonly provider: GitProvider;
	readonly host: string;
}

// Runtime PR DTOs — neutral names over the existing github-query shapes. The
// GitLab adapter maps its MR/pipeline/approval data into these same shapes.
export type PullRequestNode = GitHubPullRequestNode;
export type CheckContextNode = GitHubCheckContextNode;
export type ReviewDecisionRaw = GitHubPullRequestReviewDecision;

/** GitLab `detailed_merge_status` (24 documented values; stored verbatim). */
export type GitLabDetailedMergeStatus = string;

/**
 * Provider-discriminated review/merge state. Each variant holds that provider's own
 * server-computed facts verbatim — no cross-provider verdict, no reduction (spec §6).
 */
export type NormalizedReviewState =
	| { provider: "github"; reviewDecision: ReviewDecisionRaw }
	| {
			provider: "gitlab";
			detailedMergeStatus: GitLabDetailedMergeStatus;
			approvalsRequired: number | null;
			approvalsLeft: number | null;
			approvedBy: string[];
			blockingDiscussionsResolved: boolean;
			hasConflicts: boolean;
	  };

/** Result returned from a PR/MR merge operation. */
export interface MergeResult {
	sha: string;
	merged: boolean;
	message: string;
}

/**
 * Checkout metadata for a PR/MR — mirrors the PrMetadata shape in workspaces.ts
 * so the PR checkout flow works identically for both providers.
 */
export interface PullRequestCheckoutMetadata {
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

/**
 * Background PR/MR polling. Each method encapsulates the provider's preferred
 * transport with its own fallback (GitHub: gh CLI first, Octokit fallback).
 */
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
	/** Merge a PR/MR. `method` is the merge strategy. */
	mergePullRequest(
		repo: RepoRef,
		prNumber: number,
		method: "merge" | "squash" | "rebase",
	): Promise<MergeResult>;
	/** Fetch checkout metadata for a PR/MR by number. */
	fetchPullRequestMetadata(
		repo: RepoRef,
		prNumber: number,
	): Promise<PullRequestCheckoutMetadata>;
}

/**
 * Identity client: can resolve the authenticated user for the provider.
 * Extends RepoProviderIdentity so callers always have provider/host context.
 */
export interface RepoIdentityClient extends RepoProviderIdentity {
	/** Returns `{ login: string }` for the authenticated user, or null on failure. */
	getAuthenticatedUser(): Promise<{ login: string } | null>;
}

/** Repo identity for search — needs the local path for `gh` cwd. */
export interface SearchRepoRef extends RepoRef {
	repoPath?: string | null;
}

export interface PullRequestSearchFilters {
	/** Free text as the user typed it; the adapter interprets provider syntax. */
	text?: string;
	includeClosed?: boolean;
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
}
export interface PullRequestsPage {
	pullRequests: PullRequestSummary[];
	totalCount: number;
	hasNextPage: boolean;
	page: number;
	/** Set (to "owner/name") when the query targeted a different repo. */
	repoMismatch?: string;
}

export interface IssueSummary {
	issueNumber: number;
	title: string;
	url: string;
	state: string;
	authorLogin: string | null;
}
export interface IssuesPage {
	issues: IssueSummary[];
	totalCount: number;
	hasNextPage: boolean;
	page: number;
	repoMismatch?: string;
}

/** Interactive PR/issue pickers (workspace-creation). */
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
}

/**
 * Full provider client: identity + all capability contracts (runtime, search,
 * content, review, identity). Both GitHubProviderClient and
 * GitLabProviderClient implement this intersection.
 */
export type RepoProviderClient = RepoProviderIdentity &
	RepoRuntimeClient &
	RepoSearchClient &
	RepoContentClient &
	RepoReviewClient &
	RepoIdentityClient;
