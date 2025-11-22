import type { MosaicNode } from "react-mosaic-component";

export interface Project {
	id: string;
	mainRepoPath: string;
	name: string;
	color: string;
	tabOrder: number | null;
	lastOpenedAt: number;
	createdAt: number;
}

export interface Worktree {
	id: string;
	projectId: string;
	path: string;
	branch: string;
	createdAt: number;
}

export interface Workspace {
	id: string;
	projectId: string;
	worktreeId: string;
	name: string;
	tabOrder: number;
	activeTabId?: string;
	isActive: boolean;
	createdAt: number;
	updatedAt: number;
	lastOpenedAt: number;
}

// Shared fields for all tab types
export interface BaseTab {
	id: string;
	workspaceId: string;
	title: string;
	position: number;
	parentId?: string;
	layout?: MosaicNode<string>;
	needsAttention?: boolean;
	createdAt: number;
	updatedAt: number;
}

// Discriminated union for type safety (future-proof for other tab types)
export type Tab =
	| (BaseTab & { type: "terminal" })
	| (BaseTab & { type: "group" });

export interface Database {
	projects: Project[];
	worktrees: Worktree[];
	workspaces: Workspace[];
	tabs: Tab[];
}

export const defaultDatabase: Database = {
	projects: [],
	worktrees: [],
	workspaces: [],
	tabs: [],
};
