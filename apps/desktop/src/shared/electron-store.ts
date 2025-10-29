// ========================================
// SHARED TYPES ONLY - No runtime code!
// These types are used by both main and renderer processes
// ========================================

export interface WorkspaceRef {
	id: string;
	name: string;
	repoPath: string;
}

export interface TabTemplate {
	name: string;
	command?: string | null;
	row: number;
	col: number;
	rowSpan?: number;
	colSpan?: number;
}

export interface TabGroupTemplate {
	id: string;
	name: string;
	rows: number;
	cols: number;
	tabs: TabTemplate[];
}

export interface ConfigSchema {
	workspaces: WorkspaceRef[];
	lastWorkspaceId: string | null;
	tabGroupTemplates: TabGroupTemplate[];
}
