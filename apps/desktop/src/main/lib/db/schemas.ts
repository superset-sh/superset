/**
 * Database schemas for local-first storage
 * These types define the structure of data stored in lowdb
 */

export interface RecentProject {
	path: string;
	name: string;
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

export interface Workspace {
	id: string; // nanoid
	path: string | null; // null for new workspaces that haven't opened a project yet
	name: string;
	order: number; // Explicit order in the workspace tabs (0 = first, 1 = second, etc.)
	createdAt: number;
	updatedAt: number;
	lastOpenedAt: number;
}

export interface Settings {
	lastActiveWorkspaceId?: string;
}

export interface Database {
	workspaces: Workspace[];
	recentProjects: RecentProject[];
	settings: Settings;
}

/**
 * Default database state
 */
export const defaultDatabase: Database = {
	workspaces: [],
	recentProjects: [],
	settings: {},
};
