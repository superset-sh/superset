/**
 * VCS abstraction types for supporting both Git and Jujutsu (jj).
 */

import type { VcsType } from "@superset/local-db";

export type { VcsType };

/**
 * A workspace discovered on disk that isn't tracked in the Superset DB.
 * For git: a git worktree. For jj: a jj workspace.
 */
export interface ExternalWorkspace {
	path: string;
	/** Branch name (git) or bookmark name (jj), null if detached */
	branch: string | null;
	isDetached: boolean;
	isBare: boolean;
}

/**
 * Result of checking whether a branch exists on a remote.
 */
export type BranchExistsOnRemoteResult =
	| { status: "exists" }
	| { status: "not_found" }
	| { status: "error"; message: string };

/**
 * VCS provider interface covering operations that differ between git and jj.
 *
 * Git-specific operations that don't need abstraction (PR handling, author
 * prefix utilities, branch naming) are NOT part of this interface and continue
 * to be imported directly from git.ts.
 */
export interface VcsProvider {
	readonly type: VcsType;

	// --- Workspace lifecycle ---

	/**
	 * Create a new workspace with a new branch/bookmark.
	 * Git: `git worktree add <path> -b <branch> <startPoint>`
	 * Jj: `jj workspace add <path> --name <name> -r <startPoint>`
	 */
	createWorkspace(params: {
		mainRepoPath: string;
		branch: string;
		workspacePath: string;
		startPoint?: string;
	}): Promise<void>;

	/**
	 * Create a workspace from an existing branch/bookmark.
	 * Git: `git worktree add <path> <branch>`
	 * Jj: `jj workspace add <path> --name <name> -r <branch>`
	 */
	createWorkspaceFromExistingBranch(params: {
		mainRepoPath: string;
		branch: string;
		workspacePath: string;
	}): Promise<void>;

	/**
	 * Remove a workspace and clean up.
	 * Git: rename + `git worktree prune` + async rm
	 * Jj: `jj workspace forget` + async rm
	 */
	removeWorkspace(mainRepoPath: string, workspacePath: string): Promise<void>;

	/**
	 * Check if a workspace is registered for the given path.
	 */
	workspaceExists(
		mainRepoPath: string,
		workspacePath: string,
	): Promise<boolean>;

	/**
	 * List all workspaces discovered on disk.
	 */
	listExternalWorkspaces(mainRepoPath: string): Promise<ExternalWorkspace[]>;

	/**
	 * Check if a branch/bookmark is already checked out in a workspace.
	 * Returns the workspace path if so, null otherwise.
	 */
	getBranchWorkspacePath(params: {
		mainRepoPath: string;
		branch: string;
	}): Promise<string | null>;

	// --- Status & inspection ---

	/**
	 * Check if there are uncommitted changes in the working directory.
	 */
	hasUncommittedChanges(workspacePath: string): Promise<boolean>;

	/**
	 * Check if there are commits that haven't been pushed to the remote.
	 */
	hasUnpushedCommits(workspacePath: string): Promise<boolean>;

	/**
	 * Get the number of commits ahead/behind the default branch.
	 */
	getAheadBehindCount(params: {
		repoPath: string;
		defaultBranch: string;
	}): Promise<{ ahead: number; behind: number }>;

	/**
	 * Get the current branch/bookmark name, or null if detached/no bookmark.
	 * Note: jj has no "active bookmark" concept — returns best-effort result.
	 */
	getCurrentBranch(repoPath: string): Promise<string | null>;

	// --- Branch/bookmark operations ---

	/**
	 * List local and remote branches/bookmarks.
	 */
	listBranches(
		repoPath: string,
		options?: { fetch?: boolean },
	): Promise<{ local: string[]; remote: string[] }>;

	/**
	 * Determine the default branch (main, master, etc.).
	 */
	getDefaultBranch(mainRepoPath: string): Promise<string>;

	/**
	 * Sync the default branch from remote and return its name.
	 */
	refreshDefaultBranch(mainRepoPath: string): Promise<string | null>;

	/**
	 * Fetch the default branch from remote and return the commit hash.
	 */
	fetchDefaultBranch(
		mainRepoPath: string,
		defaultBranch: string,
	): Promise<string>;

	/**
	 * Delete a local branch/bookmark without affecting the remote.
	 * Git: `git branch -D`
	 * Jj: `jj bookmark forget`
	 */
	deleteLocalBranch(params: {
		mainRepoPath: string;
		branch: string;
	}): Promise<void>;

	/**
	 * Switch to a branch/bookmark in the main repo.
	 * Git: `git checkout`
	 * Jj: `jj edit`
	 */
	checkoutBranch(repoPath: string, branch: string): Promise<void>;

	/**
	 * Safe branch switch with pre-flight checks.
	 */
	safeCheckoutBranch(repoPath: string, branch: string): Promise<void>;

	// --- Ref/remote checks ---

	/**
	 * Check if a ref exists locally (without network access).
	 */
	refExistsLocally(repoPath: string, ref: string): Promise<boolean>;

	/**
	 * Check if the repo has an "origin" remote configured.
	 */
	hasOriginRemote(mainRepoPath: string): Promise<boolean>;

	/**
	 * Check if a branch/bookmark exists on the remote.
	 */
	branchExistsOnRemote(
		repoPath: string,
		branch: string,
	): Promise<BranchExistsOnRemoteResult>;

	// --- Repository root ---

	/**
	 * Get the repository root path from an arbitrary path within the repo.
	 */
	getRepoRoot(path: string): Promise<string>;

	// --- Base branch config ---

	/**
	 * Get the configured base branch for a workspace branch.
	 * Both git and jj (colocated) use `git config branch.<name>.base`.
	 */
	getBaseBranchConfig(repoPath: string, branch: string): Promise<string | null>;

	/**
	 * Set the base branch config for a workspace branch.
	 * Both git and jj (colocated) use `git config branch.<name>.base`.
	 */
	setBaseBranchConfig(
		repoPath: string,
		branch: string,
		baseBranch: string,
	): Promise<void>;
}
