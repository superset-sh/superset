/**
 * Our richer git-status enum — shared by `useGitStatusMap` (Files tab) and
 * `StatusIndicator` (changes tab). `@pierre/trees`' own enum is narrower; see
 * `FILE_STATUS_TO_PIERRE`.
 */
export type FileStatus =
	| "added"
	| "changed"
	| "copied"
	| "deleted"
	| "modified"
	| "renamed"
	| "untracked";

/** The status values `@pierre/trees` understands for row tint / indicators. */
export type PierreGitStatus =
	| "added"
	| "deleted"
	| "ignored"
	| "modified"
	| "renamed"
	| "untracked";

/** One `setGitStatus` entry: a tree path plus its Pierre status. */
export interface PierreGitStatusEntry {
	path: string;
	status: PierreGitStatus;
}

/**
 * Maps our status enum onto Pierre's. `changed` (binary modify) → `modified`;
 * `copied` → `added` (Pierre has no native equivalent). `ignored` has no
 * per-file source status, so it isn't in this map — callers set it directly.
 */
export const FILE_STATUS_TO_PIERRE: Record<
	FileStatus,
	Exclude<PierreGitStatus, "ignored">
> = {
	added: "added",
	changed: "modified",
	copied: "added",
	deleted: "deleted",
	modified: "modified",
	renamed: "renamed",
	untracked: "untracked",
};
