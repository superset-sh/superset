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
