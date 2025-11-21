/**
 * Database schemas for local-first storage
 * These types define the structure of data stored in lowdb
 */

/**
 * Project represents a main git repository
 */
export interface Project {
	id: string; // nanoid
	mainRepoPath: string; // Absolute path to the main git repo
	name: string; // Project name (derived from folder name)
	lastOpenedAt: number; // Timestamp of last access
	createdAt: number;
}

/**
 * Worktree represents a git worktree
 */
export interface Worktree {
	id: string; // nanoid
	projectId: string; // References Project.id
	path: string; // Absolute path to the worktree
	branch: string; // Git branch name - source of truth for git operations
	createdAt: number;
}

/**
 * Workspace represents a UI tab (1:1 with Worktree)
 */
export interface Workspace {
	id: string; // nanoid
	projectId: string; // References Project.id
	worktreeId: string; // References Worktree.id
	name: string; // User-facing workspace name
	order: number; // Explicit order in the workspace tabs (0 = first, 1 = second, etc.)
	createdAt: number;
	updatedAt: number;
	lastOpenedAt: number;
}

export interface Tab {
	id: string; // nanoid
	title: string;
	terminalId?: string;
	type: "single" | "group";
	createdAt: number;
	updatedAt: number;
}

export interface Settings {
	lastActiveWorkspaceId?: string;
}

export interface Database {
	projects: Project[];
	worktrees: Worktree[];
	workspaces: Workspace[];
	settings: Settings;
}

/**
 * Default database state
 */
export const defaultDatabase: Database = {
	projects: [],
	worktrees: [],
	workspaces: [],
	settings: {},
};
