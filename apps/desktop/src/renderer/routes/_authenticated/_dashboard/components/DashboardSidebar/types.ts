import type { WorkspaceTransactionSnapshot } from "renderer/stores/workspace-creates";

export type DashboardSidebarWorkspaceHostType =
	| "local-device"
	| "remote-device"
	| "cloud";

export type DashboardSidebarWorkspaceType = "main" | "worktree" | "session";

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
	/** Lineage: the workspace this one was spawned from. Null = top-level. */
	parentWorkspaceId: string | null;
	/**
	 * Nesting depth in the rendered tree (0 = root). Derived per container by
	 * nestSidebarWorkspaceLineage — a child whose parent is not rendered in
	 * the same container re-roots at 0.
	 */
	lineageDepth: number;
	/** Direct lineage children present in the same container (rendered or
	 * hidden by collapse). Drives the expand/collapse chevron. */
	lineageChildCount: number;
	/** True when this row's child subtree is collapsed in the sidebar. */
	lineageCollapsed: boolean;
	/** One flag per ancestor rail column (index = depth level): true when
	 *  that rail continues past this row, i.e. the ancestor at that level
	 *  has later siblings. Drives ├ vs └ connectors. Empty for roots. */
	lineageGuides: boolean[];
	/** True for every row of a container that has any nesting: rows reserve a
	 *  leading chevron gutter so icons stay aligned between parents and leaves. */
	lineageGutter: boolean;
	/** Every descendant id (rendered or collapsed); empty for leaves. */
	lineageDescendantIds: string[];
	/** Ancestor ids from the thread root down to the direct parent. */
	lineageAncestorIds: string[];
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
