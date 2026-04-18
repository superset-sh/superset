export type DashboardSidebarWorkspaceHostType =
	| "local-device"
	| "remote-device"
	| "cloud";

export interface DashboardSidebarWorkspacePullRequestCheck {
	name: string;
	status: "success" | "failure" | "pending" | "skipped" | "cancelled";
	url: string | null;
}

export interface DashboardSidebarWorkspacePullRequest {
	url: string;
	number: number;
	title: string;
	state: "open" | "merged" | "closed" | "draft";
	reviewDecision: "approved" | "changes_requested" | "pending" | null;
	requestedReviewers?: string[];
	checksStatus: "success" | "failure" | "pending" | "none";
	checks: DashboardSidebarWorkspacePullRequestCheck[];
}

export interface DashboardSidebarWorkspace {
	id: string;
	projectId: string;
	hostId: string;
	hostType: DashboardSidebarWorkspaceHostType;
	accentColor: string | null;
	name: string;
	branch: string;
	pullRequest: DashboardSidebarWorkspacePullRequest | null;
	repoUrl: string | null;
	branchExistsOnRemote: boolean;
	previewUrl: string | null;
	needsRebase: boolean | null;
	behindCount: number | null;
	createdAt: Date;
	updatedAt: Date;
	creationStatus?: "preparing" | "generating-branch" | "creating" | "failed";
}

export interface DashboardSidebarSection {
	id: string;
	projectId: string;
	name: string;
	createdAt: Date;
	isCollapsed: boolean;
	tabOrder: number;
	color: string | null;
	workspaces: DashboardSidebarWorkspace[];
}

export type DashboardSidebarProjectChild =
	| {
			type: "workspace";
			workspace: DashboardSidebarWorkspace;
	  }
	| {
			type: "section";
			section: DashboardSidebarSection;
	  };

export type DashboardSidebarProjectBackingState =
	// Project is backed on the current host, or at least one remote host
	// backing it is online — user can do everything.
	| "normal"
	// No local backing, no online remote backing, but at least one offline
	// remote host backs it — passive state, resolves when that host reconnects.
	| "host-offline"
	// No local backing, no remote backing anywhere — user needs to set up
	// on this host (or wait for a teammate to).
	| "not-set-up-here";

export interface DashboardSidebarProject {
	id: string;
	name: string;
	slug: string;
	githubRepositoryId: string | null;
	githubOwner: string | null;
	githubRepoName: string | null;
	createdAt: Date;
	updatedAt: Date;
	isCollapsed: boolean;
	backingState: DashboardSidebarProjectBackingState;
	children: DashboardSidebarProjectChild[];
}
