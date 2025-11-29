/**
 * Type definitions for git diff operations
 */

export type FileStatus = "A" | "M" | "D" | "R" | "C" | "U" | "?";

export interface ChangedFile {
	/** Relative file path */
	path: string;
	/** File status (Added, Modified, Deleted, Renamed, Copied, Unmerged, Untracked) */
	status: FileStatus;
	/** Original path for renamed/copied files */
	oldPath?: string;
	/** Number of lines added */
	additions: number;
	/** Number of lines deleted */
	deletions: number;
}

export type DiffLineType = "context" | "addition" | "deletion";

export interface DiffLine {
	/** Line type */
	type: DiffLineType;
	/** Line content (without +/- prefix) */
	content: string;
	/** Line number in old file (null for additions) */
	oldLineNumber: number | null;
	/** Line number in new file (null for deletions) */
	newLineNumber: number | null;
}

export interface DiffHunk {
	/** Hunk header (e.g., "@@ -1,5 +1,6 @@") */
	header: string;
	/** Starting line in old file */
	oldStart: number;
	/** Number of lines in old file */
	oldCount: number;
	/** Starting line in new file */
	newStart: number;
	/** Number of lines in new file */
	newCount: number;
	/** Lines in this hunk */
	lines: DiffLine[];
}

export interface FileDiff {
	/** File path */
	path: string;
	/** Original path for renamed files */
	oldPath?: string;
	/** Whether this is a binary file */
	isBinary: boolean;
	/** Detected language for syntax highlighting */
	language: string;
	/** Diff hunks */
	hunks: DiffHunk[];
}

export interface Commit {
	/** Full commit SHA */
	sha: string;
	/** Short commit SHA (7 chars) */
	shortSha: string;
	/** Commit message (first line) */
	message: string;
	/** Author name */
	author: string;
	/** Commit date */
	date: string;
}

export type DiffMode = "unstaged" | "staged" | "all-changes" | "range";
