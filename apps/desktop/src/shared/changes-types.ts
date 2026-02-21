/**
 * Types for the git changes/diff viewer feature
 */

/** File status from git, matching short format codes */
export type FileStatus =
	| "added"
	| "modified"
	| "deleted"
	| "renamed"
	| "copied"
	| "untracked";

/** Change categories for organizing the sidebar */
export type ChangeCategory =
	| "against-base"
	| "committed"
	| "staged"
	| "unstaged";

/** A changed file entry */
export interface ChangedFile {
	path: string; // Relative path from repo root
	oldPath?: string; // Original path for renames/copies
	status: FileStatus;
	additions: number;
	deletions: number;
}

/** A commit summary for the committed changes section */
export interface CommitInfo {
	hash: string;
	shortHash: string; // Short hash (7 chars)
	message: string; // Commit message (first line)
	author: string;
	date: Date;
	files: ChangedFile[];
}

/** Indicates which enrichment steps were skipped due to large changeset size */
export interface TruncatedStatus {
	numstat?: boolean;
	untrackedLineCount?: boolean;
	againstBase?: boolean;
}

/** Full git changes status for a worktree */
export interface GitChangesStatus {
	branch: string;
	defaultBranch: string; // Default branch (main/master)
	againstBase: ChangedFile[]; // All files changed vs base branch
	commits: CommitInfo[]; // Individual commits on branch (not on default)
	staged: ChangedFile[];
	unstaged: ChangedFile[];
	untracked: ChangedFile[];
	ahead: number; // Commits ahead of default branch
	behind: number; // Commits behind default branch
	// Tracking branch status (for push/pull)
	pushCount: number; // Commits to push to tracking branch
	pullCount: number; // Commits to pull from tracking branch
	hasUpstream: boolean; // Whether branch has an upstream tracking branch
	truncated?: TruncatedStatus; // Which enrichment steps were skipped
}

/** Whether a diff category supports editing (saving changes back to disk) */
export function isDiffEditable(category: ChangeCategory): boolean {
	return category === "staged" || category === "unstaged";
}

/** Diff view mode toggle */
export type DiffViewMode = "side-by-side" | "inline";

/** Input for getting file diff */
export interface FileDiffInput {
	worktreePath: string;
	filePath: string;
	category: ChangeCategory;
	commitHash?: string; // For committed category: which commit to show
}

/** File contents for Monaco diff editor */
export interface FileContents {
	original: string; // Original content (before changes)
	modified: string; // Modified content (after changes)
	language: string; // Detected language for syntax highlighting
}
