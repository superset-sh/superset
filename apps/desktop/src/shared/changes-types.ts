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
	| "against-main"
	| "committed"
	| "staged"
	| "unstaged";

/** A changed file entry */
export interface ChangedFile {
	/** Relative path from repo root */
	path: string;
	/** Original path for renames/copies */
	oldPath?: string;
	/** Git status of the file */
	status: FileStatus;
	/** Lines added */
	additions: number;
	/** Lines deleted */
	deletions: number;
}

/** A commit summary for the committed changes section */
export interface CommitInfo {
	/** Full commit hash */
	hash: string;
	/** Short hash (7 chars) */
	shortHash: string;
	/** Commit message (first line) */
	message: string;
	/** Author name */
	author: string;
	/** Commit date */
	date: Date;
	/** Files changed in this commit */
	files: ChangedFile[];
}

/** Full git changes status for a worktree */
export interface GitChangesStatus {
	/** Current branch name */
	branch: string;
	/** Default branch (main/master) */
	defaultBranch: string;
	/** All files changed vs default branch */
	againstMain: ChangedFile[];
	/** Individual commits on branch (not on default) */
	commits: CommitInfo[];
	/** Staged files (in index) */
	staged: ChangedFile[];
	/** Unstaged modified files */
	unstaged: ChangedFile[];
	/** Untracked files */
	untracked: ChangedFile[];
	/** Commits ahead of default branch */
	ahead: number;
	/** Commits behind default branch */
	behind: number;
}

/** Diff view mode toggle */
export type DiffViewMode = "side-by-side" | "inline";

/** Input for getting file diff */
export interface FileDiffInput {
	worktreePath: string;
	filePath: string;
	category: ChangeCategory;
	/** For committed category: which commit to show */
	commitHash?: string;
}

/** File contents for Monaco diff editor */
export interface FileContents {
	/** Original content (before changes) */
	original: string;
	/** Modified content (after changes) */
	modified: string;
	/** Detected language for syntax highlighting */
	language: string;
}
