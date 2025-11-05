import type { BrowserWindow, IpcMainInvokeEvent } from "electron";

import type { registerRoute } from "lib/electron-router-dom";

export type BrowserWindowOrNull = Electron.BrowserWindow | null;

type Route = Parameters<typeof registerRoute>[0];

export interface WindowProps extends Electron.BrowserWindowConstructorOptions {
	id: Route["id"];
	query?: Route["query"];
}

export interface WindowCreationByIPC {
	channel: string;
	window(): BrowserWindowOrNull;
	callback(window: BrowserWindow, event: IpcMainInvokeEvent): void;
}

// Workspace types - React Mosaic Layout

// Tab types that can be displayed
export type TabType =
	| "terminal"
	| "editor"
	| "browser"
	| "preview"
	| "group"
	| "port";

// Mosaic tree node types
export type MosaicDirection = "row" | "column";

export type MosaicNode<T> = MosaicParent<T> | T;

export interface MosaicParent<T> {
	direction: MosaicDirection;
	first: MosaicNode<T>;
	second: MosaicNode<T>;
	splitPercentage?: number;
}

export interface Tab {
	id: string;
	name: string;
	type: TabType; // Type of content to display
	// Terminal-specific properties
	command?: string | null; // For terminal tabs
	cwd?: string; // Current working directory (for terminal tabs)
	url?: string; // For preview/browser tabs
	// Mosaic layout properties (used when type === "group")
	tabs?: Tab[]; // Child tabs when type is "group" (NOTE: cannot contain nested group tabs)
	mosaicTree?: MosaicNode<string>; // Mosaic tree structure (tab IDs as leaf nodes)
	createdAt: string;
}

export interface Worktree {
	id: string;
	branch: string;
	path: string;
	tabs: Tab[]; // Changed from tabGroups to tabs
	createdAt: string;
	detectedPorts?: Record<string, number>; // Map of service name to detected port
	merged?: boolean; // Indicates if this worktree has been merged into another worktree
	description?: string; // Optional description of the worktree's goal or purpose
}

export interface Workspace {
	id: string;
	name: string;
	repoPath: string;
	branch: string;
	worktrees: Worktree[];
	// Active selection for this workspace
	activeWorktreeId: string | null;
	activeTabId: string | null; // Unified tab selection (no more activeTabGroupId)
	createdAt: string;
	updatedAt: string;
	ports?: Array<number | { name: string; port: number }>; // Port configuration for proxy routing
}

export interface WorkspaceConfig {
	workspaces: Workspace[];
	activeWorkspaceId: string | null; // Currently active workspace
}

export interface CreateWorkspaceInput {
	name: string;
	repoPath: string;
	branch: string;
}

export interface CreateWorktreeInput {
	workspaceId: string;
	branch: string;
	createBranch?: boolean;
	cloneTabsFromWorktreeId?: string; // Optional worktree ID to clone tab setup from
	sourceBranch?: string; // Optional source branch to create from (defaults to current branch)
	description?: string; // Optional description of the worktree's goal or purpose
}

export interface CreateTabInput {
	workspaceId: string;
	worktreeId: string;
	parentTabId?: string; // Optional parent tab (for tabs inside a group)
	name: string;
	type?: TabType; // Optional - defaults to "terminal"
	command?: string | null;
	url?: string; // Initial URL for preview/browser tabs
	// For copying tab content when splitting
	copyFromTabId?: string;
}

export interface UpdatePreviewTabInput {
	workspaceId: string;
	worktreeId: string;
	tabId: string;
	url: string;
}

export interface UpdateWorkspaceInput {
	id: string;
	name?: string;
}

// Setup script configuration
export interface SetupConfig {
	copy?: string[]; // File patterns to copy from main repo (supports globs)
	commands?: string[]; // Shell commands to run in worktree directory
}

export interface SetupResult {
	success: boolean;
	output: string; // Combined stdout/stderr
	error?: string; // Error message if failed
}

// Port detection types
export interface DetectedPort {
	port: number;
	service?: string;
	terminalId: string;
	detectedAt: string;
}
