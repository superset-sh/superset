/**
 * Linked worktrees feature — shared types (P0 contract).
 *
 * A "linked target" is a dependency inside a worktree's dependency directory
 * (node_modules / vendor) that is a symlink resolving to *another worktree on
 * disk*. These are surfaced in the sidebar, nested beneath the owning worktree.
 *
 * This file is the frozen contract between the host-side scanner/procedure and
 * the renderer-side sidebar UI. Both sides import these types; do not change
 * the shape without updating all three plans (P1 scanner, P2 procedure, P3 UI).
 */

export type LinkedTargetKind =
	/** Resolves to a worktree superset already tracks (has a workspace). */
	| "tracked"
	/** Resolves to a git checkout superset doesn't track (branch derived live). */
	| "untracked"
	/** Resolves to a non-git directory — show the path, no branch. */
	| "external";

export interface LinkedTarget {
	/** Dependency dir holding the link, relative to the worktree root, e.g. "client/node_modules". */
	sourceDir: string;
	/** Package manager whose directory the link was found in. */
	ecosystem: "npm" | "composer";
	/** Package name as it appears in the dependency dir, e.g. "shared-lib" or "@scope/pkg". */
	packageName: string;
	/** Text shown after the "~": the target's branch, or its dir basename for `external`. */
	label: string;
	/** How the target was classified. */
	kind: LinkedTargetKind;
	/** Present iff kind === "tracked": the workspace id representing the target worktree. */
	targetWorkspaceId?: string;
	/** Present iff kind === "tracked": the target worktree's project id. */
	targetProjectId?: string;
	/** Resolved absolute path of the symlink target. */
	targetPath: string;
}
