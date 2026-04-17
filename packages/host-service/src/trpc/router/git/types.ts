/**
 * Git & GitHub types for the git tRPC router.
 *
 * Design principle: mirror GitHub's data model. Base types are subsets of
 * GitHub's GraphQL/REST schema. Our extensions (Branch, ChangedFile) add
 * local git concepts using the same naming conventions.
 */

// ---------------------------------------------------------------------------
// GitHub enums (lowercased from GraphQL SCREAMING_CASE)
// ---------------------------------------------------------------------------

/** GitHub GraphQL: PatchStatus */
export type PatchStatus =
	| "added"
	| "copied"
	| "changed"
	| "deleted"
	| "modified"
	| "renamed";

/** GitHub GraphQL: DiffSide */
export type DiffSide = "LEFT" | "RIGHT";

/** GitHub GraphQL: PullRequestState */
export type PullRequestState = "open" | "closed" | "merged";

/** GitHub GraphQL: PullRequestReviewDecision */
export type PullRequestReviewDecision =
	| "approved"
	| "changes_requested"
	| "review_required";

/** GitHub GraphQL: CheckStatusState */
export type CheckStatusState =
	| "completed"
	| "in_progress"
	| "pending"
	| "queued";

/** GitHub GraphQL: CheckConclusionState */
export type CheckConclusionState =
	| "success"
	| "failure"
	| "cancelled"
	| "skipped"
	| "neutral"
	| "timed_out"
	| "action_required"
	| "stale";

/** GitHub GraphQL: MergeableState */
export type MergeableState = "mergeable" | "conflicting" | "unknown";

// ---------------------------------------------------------------------------
// GitHub objects (subset of fields we use)
// ---------------------------------------------------------------------------

export interface GitHubActor {
	login: string;
	avatarUrl: string;
}

export interface PullRequestReviewComment {
	id: string;
	databaseId: number;
	author: GitHubActor;
	body: string;
	createdAt: string;
}

export interface PullRequestReviewThread {
	id: string;
	isResolved: boolean;
	diffSide: DiffSide;
	line: number | null;
	path: string;
	comments: PullRequestReviewComment[];
}

export interface CheckRun {
	name: string;
	status: CheckStatusState;
	conclusion: CheckConclusionState | null;
	detailsUrl: string | null;
	startedAt: string | null;
	completedAt: string | null;
}

export interface IssueComment {
	id: number;
	user: GitHubActor;
	body: string;
	createdAt: string;
	htmlUrl: string;
}

// ---------------------------------------------------------------------------
// Our resource types
// ---------------------------------------------------------------------------

/** Extends GitHub's PatchStatus with "untracked" for local working tree */
export type FileStatus = PatchStatus | "untracked";

export interface Branch {
	name: string;
	isHead: boolean;
	upstream: string | null;
	aheadCount: number;
	behindCount: number;
	lastCommitHash: string;
	lastCommitDate: string;
}

export interface ChangedFile {
	path: string;
	oldPath?: string;
	status: FileStatus;
	additions: number;
	deletions: number;
}

export interface Commit {
	hash: string;
	shortHash: string;
	message: string;
	author: string;
	date: string;
}
