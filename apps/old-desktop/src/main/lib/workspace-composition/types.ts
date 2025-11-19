import type { LocalWorkspace } from "../types/cli-types";
import type { WorktreeUiMetadata } from "../ui-store/types";
import type { WorktreeInfo } from "../worktree-manager";

/**
 * Scanned worktree with Git information
 */
export interface ScannedWorktree extends WorktreeInfo {
	/** Current branch (may differ from WorktreeInfo.branch) */
	currentBranch: string;
	/** Whether this branch has been merged into main */
	merged?: boolean;
}

/**
 * Composed worktree - Git scan + UI metadata
 */
export interface ComposedWorktree extends ScannedWorktree {
	/** UI metadata merged from persistence */
	ui: WorktreeUiMetadata;
}

/**
 * Composed workspace state
 * Domain workspace + scanned worktrees + UI state
 */
export interface ComposedWorkspaceState {
	/** Domain workspace (LocalWorkspace) */
	workspace: LocalWorkspace;
	/** Scanned worktrees from Git merged with UI metadata */
	worktrees: ComposedWorktree[];
	/** UI state */
	ui: {
		activeWorktreePath: string | null;
		activeTabId: string | null;
	};
}

/**
 * Rescan result showing what changed
 */
export interface RescanResult {
	/** New worktrees detected */
	added: ScannedWorktree[];
	/** Worktrees that no longer exist */
	removed: ScannedWorktree[];
	/** Worktrees that changed (branch, path, etc.) */
	changed: Array<{
		old: ScannedWorktree;
		new: ScannedWorktree;
	}>;
	/** Composed state after rescan */
	state: ComposedWorkspaceState;
}
