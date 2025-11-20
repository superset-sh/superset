import type { MosaicNode, Tab } from "shared/types";

/**
 * UI state types for Desktop app
 * These are Desktop-specific and separate from domain state
 */

/**
 * Window state - persisted per window
 */
export interface WindowState {
	id: string;
	bounds?: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	isMaximized?: boolean;
	isFullScreen?: boolean;
}

/**
 * Desktop settings - global UI preferences
 */
export interface DesktopSettings {
	lastActiveWorkspaceId: string | null;
	preferences?: {
		[key: string]: unknown;
	};
}

/**
 * Per-worktree UI metadata
 * Keyed by worktree path (primary) and branch (secondary)
 */
export interface WorktreeUiMetadata {
	/** Worktree path (primary key) */
	path: string;
	/** Branch name (secondary key for fallback matching) */
	branch: string;
	/** Optional description */
	description?: string;
	/** Pull request URL if created */
	prUrl?: string;
	/** Whether this worktree has been merged */
	merged?: boolean;
	/** Tabs for this worktree */
	tabs: Tab[];
	/** Mosaic layout tree */
	mosaicTree?: MosaicNode<string>;
	/** Active tab ID */
	activeTabId: string | null;
	/** Last updated timestamp */
	updatedAt: string;
}

/**
 * Per-workspace UI state
 */
export interface WorkspaceUiState {
	workspaceId: string;
	/** Active worktree path */
	activeWorktreePath: string | null;
	/** Per-worktree UI metadata keyed by path */
	worktrees: Record<string, WorktreeUiMetadata>;
	/** Last updated timestamp */
	updatedAt: string;
}

/**
 * UI store structure
 */
export interface UiStore {
	windowState: WindowState[];
	settings: DesktopSettings;
	workspaces: Record<string, WorkspaceUiState>;
}
