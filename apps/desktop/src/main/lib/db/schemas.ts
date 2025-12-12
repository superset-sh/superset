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

export interface CheckItem {
	name: string;
	status: "success" | "failure" | "pending" | "skipped" | "cancelled";
	url?: string;
}

export interface GitHubStatus {
	pr: {
		number: number;
		title: string;
		url: string;
		state: "open" | "draft" | "merged" | "closed";
		mergedAt?: number;
		additions: number;
		deletions: number;
		reviewDecision: "approved" | "changes_requested" | "pending";
		checksStatus: "success" | "failure" | "pending" | "none";
		checks: CheckItem[];
	} | null;
	repoUrl: string;
	branchExistsOnRemote: boolean;
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
	"sublime",
	"xcode",
	"iterm",
	"warp",
	"terminal",
	// JetBrains IDEs
	"intellij",
	"webstorm",
	"pycharm",
	"phpstorm",
	"rubymine",
	"goland",
	"clion",
	"rider",
	"datagrip",
	"appcode",
	"fleet",
	"rustrover",
] as const;

export type ExternalApp = (typeof EXTERNAL_APPS)[number];

export interface SSHConnection {
	id: string;
	name: string;
	host: string;
	port: number;
	username: string;
	authMethod: "key" | "password";
	privateKeyPath?: string;
	// Note: password is stored in memory only during active session, never persisted
	lastUsedAt: number;
	createdAt: number;
}

export interface TerminalPreset {
	id: string;
	name: string;
	cwd: string;
	commands: string[];
}

export interface Settings {
	lastActiveWorkspaceId?: string;
	lastUsedApp?: ExternalApp;
	terminalPresets?: TerminalPreset[];
	selectedRingtoneId?: string;
}

export interface Database {
	projects: Project[];
	worktrees: Worktree[];
	workspaces: Workspace[];
	sshConnections: SSHConnection[];
	settings: Settings;
}

export const defaultDatabase: Database = {
	projects: [],
	worktrees: [],
	workspaces: [],
	sshConnections: [],
	settings: {},
};
