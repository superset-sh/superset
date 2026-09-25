export type MergeMethod = "squash" | "merge" | "rebase";

/** GitHub's own vocabulary, kept verbatim so nothing is lost in translation. */
export type MergeStateStatus =
	| "CLEAN"
	| "UNSTABLE"
	| "HAS_HOOKS"
	| "DIRTY"
	| "BEHIND"
	| "BLOCKED"
	| "UNKNOWN";

export type MergeableState = "MERGEABLE" | "CONFLICTING" | "UNKNOWN";

export type CheckStatus =
	| "COMPLETED"
	| "QUEUED"
	| "IN_PROGRESS"
	| "WAITING"
	| "REQUESTED"
	| "PENDING";

export type CheckConclusion =
	| "SUCCESS"
	| "NEUTRAL"
	| "SKIPPED"
	| "CANCELLED"
	| "FAILURE"
	| "TIMED_OUT"
	| "STARTUP_FAILURE"
	| "ACTION_REQUIRED"
	| "STALE";

export interface PullRequestCheck {
	/** Workflow-qualified, the way GitHub shows it: "CI / Typecheck". */
	name: string;
	status: CheckStatus;
	conclusion: CheckConclusion | null;
	isRequired: boolean;
	startedAt: Date | null;
	completedAt: Date | null;
	detailsUrl: string | null;
}

/** "Requested" means GitHub asked them; its own PENDING is an unsubmitted draft nobody else can see. */
export type ReviewerState =
	| "APPROVED"
	| "CHANGES_REQUESTED"
	| "COMMENTED"
	| "DISMISSED"
	| "REQUESTED";

export interface PullRequestReviewer {
	login: string;
	avatarUrl: string | null;
	isTeam: boolean;
	state: ReviewerState;
}

export type MergeQueueState =
	| "QUEUED"
	| "AWAITING_CHECKS"
	| "MERGEABLE"
	| "UNMERGEABLE"
	| "LOCKED";

/** Answered per viewer by GitHub, so nobody is offered a button that would be refused for them. */
export interface PullRequestCapabilities {
	merge: boolean;
	markReady: boolean;
	updateBranch: boolean;
	reopen: boolean;
	dequeue: boolean;
}

export interface PullRequest {
	id: string;
	number: number;
	title: string;
	/** The description, as GitHub-flavoured markdown. Empty when never written. */
	body: string;
	url: string;
	baseBranch: string;
	state: "open" | "closed" | "merged";
	isDraft: boolean;
	additions: number;
	deletions: number;
	changedFiles: number;
	mergedAt: Date | null;
	mergedBy: { login: string; avatarUrl: string | null } | null;
}

/**
 * GitHub's own summary of the review, covering rulesets as well as branch
 * protection. `requiredApprovals` sees only the latter, so a repository that
 * requires review through a ruleset reports 0 there and REVIEW_REQUIRED here.
 */
export type ReviewDecision =
	| "APPROVED"
	| "CHANGES_REQUESTED"
	| "REVIEW_REQUIRED"
	| null;

/** What GitHub says about merging this right now. */
export interface PullRequestMergeability {
	mergeable: MergeableState;
	mergeStateStatus: MergeStateStatus;
	approvals: number;
	requiredApprovals: number;
	reviewDecision: ReviewDecision;
	unresolvedThreads: number;
	requiresThreadResolution: boolean;
	queue: { position: number | null; state: MergeQueueState } | null;
	allowedMergeMethods: MergeMethod[];
}

/** Everything one pull request view needs, which is what the query returns. */
export interface PullRequestDetail {
	pullRequest: PullRequest;
	checks: PullRequestCheck[];
	reviewers: PullRequestReviewer[];
	mergeability: PullRequestMergeability;
	capabilities: PullRequestCapabilities;
}
