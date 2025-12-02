export interface Project {
	id: string;
	mainRepoPath: string;
	name: string;
	color: string;
	tabOrder: number | null;
	lastOpenedAt: number;
	createdAt: number;
	configToastDismissed?: boolean;
	defaultBranch?: string; // Detected default branch (e.g., 'main', 'master')
}

export interface GitStatus {
	branch: string;
	needsRebase: boolean;
	lastRefreshed: number;
}

export interface GitHubStatus {
	pr: {
		number: number;
		title: string;
		url: string;
		state: "open" | "draft" | "merged" | "closed";
		mergedAt?: number;
	} | null;
	repoUrl: string;
	lastRefreshed: number;
}

export interface Worktree {
	id: string;
	projectId: string;
	path: string;
	branch: string;
	createdAt: number;
	gitStatus?: GitStatus;
	githubStatus?: GitHubStatus;
}

export interface Workspace {
	id: string;
	projectId: string;
	worktreeId: string;
	name: string;
	tabOrder: number;
	createdAt: number;
	updatedAt: number;
	lastOpenedAt: number;
}

export interface Tab {
	id: string;
	title: string;
	terminalId?: string;
	type: "single" | "group";
	createdAt: number;
	updatedAt: number;
}

export const EXTERNAL_APPS = [
	"finder",
	"vscode",
	"cursor",
	"xcode",
	"iterm",
	"warp",
	"terminal",
] as const;

export type ExternalApp = (typeof EXTERNAL_APPS)[number];

export interface Settings {
	lastActiveWorkspaceId?: string;
	lastUsedApp?: ExternalApp;
}

export interface Database {
	projects: Project[];
	worktrees: Worktree[];
	workspaces: Workspace[];
	settings: Settings;
}

export const defaultDatabase: Database = {
	projects: [],
	worktrees: [],
	workspaces: [],
	settings: {},
};
