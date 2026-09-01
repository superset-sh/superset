import type { WorkspaceTransactionSnapshot } from "renderer/stores/workspace-creates";

export type DashboardSidebarWorkspaceHostType =
	| "local-device"
	| "remote-device"
	| "cloud";

export type DashboardSidebarWorkspaceType = "main" | "worktree" | "session";

export type DashboardSidebarWorkspaceIndentation =
	| "top-level"
	| "workspace"
	| "grouped";

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
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
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
	isPinned: boolean;
	pendingTransaction: WorkspaceTransactionSnapshot | null;
}

/**
 * A pinned workspace rendered in the sidebar's top-level Pinned section.
 * Carries its project's identity since the row renders outside any project
 * group.
 */
export type DashboardSidebarPinnedWorkspace = DashboardSidebarWorkspace & {
	/** Null for project-less "session" workspaces. */
	projectName: string | null;
	projectIconUrl: string | null;
};

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

/** A derived Sessions lane. Sessions have no project-scoped folder settings,
 * so the normalized workspace tag is both its identity and display name. */
export interface DashboardSidebarSessionTagGroup {
	tag: string;
	workspaces: DashboardSidebarWorkspace[];
}

export interface DashboardSidebarSessions {
	ungroupedWorkspaces: DashboardSidebarWorkspace[];
	tagGroups: DashboardSidebarSessionTagGroup[];
	/** Flat render order consumed by the existing single Sessions DnD lane. */
	orderedWorkspaces: DashboardSidebarWorkspace[];
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
	githubOwner: string | null;
	githubRepoName: string | null;
	iconUrl: string | null;
	/** Accent color as a `#rrggbb` hex, or null for the default. */
	color: string | null;
	createdAt: Date;
	updatedAt: Date;
	isCollapsed: boolean;
	children: DashboardSidebarProjectChild[];
}
