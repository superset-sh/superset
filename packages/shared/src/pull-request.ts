/** The one vocabulary every surface renders a pull request from. */

export type PullRequestState = "open" | "closed" | "merged";
export type PullRequestCheckStatus =
	| "success"
	| "failure"
	| "pending"
	| "skipped"
	| "cancelled";
export type PullRequestChecksStatus =
	| "success"
	| "failure"
	| "pending"
	| "none";
export type PullRequestReviewDecision =
	| "approved"
	| "changes_requested"
	| "pending"
	| null;

export interface PullRequestCheck {
	name: string;
	status: PullRequestCheckStatus;
	url: string | null;
}

/** A pull request by its own identity, with what a detail view renders. */
export interface PullRequestDetail {
	repoFullName: string;
	number: number;
	url: string;
	title: string;
	body: string;
	state: PullRequestState;
	isDraft: boolean;
	author: { login: string; avatarUrl: string | null } | null;
	head: {
		ref: string;
		/** Null when the head repository is unknown or gone (a deleted fork). */
		repoFullName: string | null;
	};
	base: { ref: string };
	reviewDecision: PullRequestReviewDecision;
	checksStatus: PullRequestChecksStatus;
	checks: PullRequestCheck[];
	createdAt: string;
	updatedAt: string;
}

export type PullRequestMergeability = "mergeable" | "conflicting" | "unknown";

export interface PullRequestActor {
	login: string;
	name: string | null;
}

export interface PullRequestConversationComment {
	id: string;
	kind: "comment" | "review";
	author: PullRequestActor | null;
	body: string;
	createdAt: string;
	/** GitHub review state (APPROVED, CHANGES_REQUESTED, COMMENTED…); null for plain comments. */
	reviewState: string | null;
	/** The comment's own page on GitHub; reviews carry none. */
	url: string | null;
}

export interface PullRequestCommitAuthor {
	/** Null when GitHub maps the commit's email to no account. */
	login: string | null;
	name: string | null;
}

export interface PullRequestCommit {
	oid: string;
	messageHeadline: string;
	committedDate: string;
	author: PullRequestCommitAuthor | null;
	/** The commit on the pull request's own commits page, which also serves fork commits. */
	url: string;
}

export interface PullRequestLabel {
	name: string;
	color: string | null;
}

/** What a full read adds over the detail: size, mergeability, people, and the conversation so far. */
export interface PullRequestActivity {
	additions: number;
	deletions: number;
	changedFiles: number;
	mergeability: PullRequestMergeability;
	mergedAt: string | null;
	closedAt: string | null;
	reviewers: PullRequestActor[];
	comments: PullRequestConversationComment[];
	commits: PullRequestCommit[];
	labels: PullRequestLabel[];
}
