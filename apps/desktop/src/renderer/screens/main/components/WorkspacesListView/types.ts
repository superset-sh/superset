export interface WorkspaceItem {
	// Unique identifier - either workspace id or worktree id for closed ones
	uniqueId: string;
	// If open, this is the workspace id
	workspaceId: string | null;
	// For closed worktrees, this is the worktree id
	worktreeId: string | null;
	projectId: string;
	projectName: string;
	worktreePath: string;
	type: "worktree" | "branch";
	branch: string;
	name: string;
	lastOpenedAt: number;
	createdAt: number;
	isUnread: boolean;
	isOpen: boolean;
}

export interface ProjectGroup {
	projectId: string;
	projectName: string;
	/**
	 * Disambiguating parent-path fragment shown when another project shares the
	 * same name; `null` when the name is already unique.
	 */
	pathContext: string | null;
	workspaces: WorkspaceItem[];
}

export type FilterMode = "all" | "active" | "closed";
