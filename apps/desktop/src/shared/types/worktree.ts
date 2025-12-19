import type { Tab } from "./tab";

export interface Worktree {
	id: string;
	branch: string;
	path: string;
	tabs: Tab[];
	createdAt: string;
	detectedPorts?: Record<string, number>;
	merged?: boolean;
	description?: string;
	prUrl?: string;
}

export interface CreateWorktreeInput {
	workspaceId: string;
	title: string;
	branch?: string;
	createBranch?: boolean;
	cloneTabsFromWorktreeId?: string;
	sourceBranch?: string;
	description?: string;
}
