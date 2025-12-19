import type { Worktree } from "./worktree";

export interface Workspace {
	id: string;
	name: string;
	repoPath: string;
	branch: string;
	worktrees: Worktree[];
	activeWorktreeId: string | null;
	activeTabId: string | null;
	createdAt: string;
	updatedAt: string;
	ports?: Array<number | { name: string; port: number }>;
}
