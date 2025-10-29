// ========================================
// RUNTIME TYPES
// These represent live instances at runtime (not persisted to config)
// Used by both main process (workspace-manager) and renderer (stores)
// ========================================

export type TabType = "terminal" | "editor" | "browser" | "preview";

export interface Tab {
	id: string;
	name: string;
	type: TabType;
	command?: string | null;
	cwd?: string;
	order: number;
	row: number;
	col: number;
	rowSpan?: number;
	colSpan?: number;
	createdAt: string;
}

export interface TabGroup {
	id: string;
	name: string;
	tabs: Tab[];
	rows: number;
	cols: number;
	createdAt: string;
}

export interface Worktree {
	id: string;
	branch: string;
	path: string;
	tabGroups: TabGroup[];
	createdAt: string;
}

export interface Workspace {
	id: string;
	name: string;
	repoPath: string;
	branch: string;
	worktrees: Worktree[];
	createdAt: string;
	updatedAt: string;
}
