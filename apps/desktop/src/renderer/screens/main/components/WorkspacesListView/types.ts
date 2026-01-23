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
	type: "worktree" | "branch" | "cloud";
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
	workspaces: WorkspaceItem[];
}

export type FilterMode = "all" | "active" | "closed";
