import type { Tab } from "./tab";

export interface Worktree {
	id: string;
	branch: string;
	path: string;
	tabs: Tab[];
	createdAt: string;
	merged?: boolean;
	description?: string;
}
