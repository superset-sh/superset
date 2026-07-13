import type { WorkspaceTransactionSnapshot } from "renderer/stores/workspace-creates";

export type DashboardSidebarWorkspaceHostType =
	| "local-device"
	| "remote-device"
	| "cloud";

export type DashboardSidebarWorkspaceType = "main" | "worktree";

/**
 * Derived per-workspace status bucket for the status-grouped sidebar. Kept here
 * (rather than in the builder) so both the builder and the shape types can
 * reference it without an import cycle.
 */
export type SidebarStatusBucket =
	| "working"
	| "waiting"
	| "open_pr"
	| "done"
	| "idle";

export interface DashboardSidebarWorkspacePullRequestCheck {
	name: string;
	status: "success" | "failure" | "pending" | "skipped" | "cancelled";
	url: string | null;
}

export interface DashboardSidebarWorkspacePullRequest {
	url: string;
	number: number;
	title: string;
	state: "open" | "merged" | "closed" | "draft" | "queued";
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
	type: DashboardSidebarWorkspaceType;
	hostIsOnline: boolean | null;
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
	taskId: string | null;
	pendingTransaction: WorkspaceTransactionSnapshot | null;
	/**
	 * Repo name for the per-row chip in status mode (where rows from different
	 * repos mix under one bucket). Populated by the status builder as the GitHub
	 * repo name, falling back to the project name so the chip is never empty;
	 * null only if the project has neither. Only *rendered* in status mode.
	 */
	repoLabel?: string | null;
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

export interface DashboardSidebarProject {
	id: string;
	name: string;
	slug: string;
	githubRepositoryId: string | null;
	githubOwner: string | null;
	githubRepoName: string | null;
	iconUrl: string | null;
	createdAt: Date;
	updatedAt: Date;
	isCollapsed: boolean;
	children: DashboardSidebarProjectChild[];
	/**
	 * "project" (default/omitted) = a real repo group. "status" = a synthetic
	 * bucket produced by `buildDashboardSidebarStatusGroups` whose `id` is
	 * `status:<bucket>`; the render layer forks on this to skip all real-project
	 * chrome (context menu, DnD, section actions).
	 */
	kind?: "project" | "status";
	/** Set only when `kind === "status"`. */
	statusBucket?: SidebarStatusBucket;
}
