import type {
	DashboardSidebarProject,
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../types";

export function makeWorkspace(
	overrides: Partial<DashboardSidebarWorkspace> & { id: string; name: string },
): DashboardSidebarWorkspace {
	return {
		projectId: "project-1",
		hostId: "host-1",
		hostType: "local-device",
		type: "worktree",
		hostIsOnline: true,
		accentColor: null,
		branch: overrides.name,
		pullRequest: null,
		repoUrl: null,
		branchExistsOnRemote: false,
		previewUrl: null,
		needsRebase: null,
		behindCount: null,
		createdAt: new Date("2026-01-01"),
		updatedAt: new Date("2026-01-01"),
		lastActivityAt: null,
		taskId: null,
		isPinned: false,
		pendingTransaction: null,
		...overrides,
	};
}

export function makeSection(
	overrides: Partial<DashboardSidebarSection> & { id: string; name: string },
): DashboardSidebarSection {
	return {
		projectId: "project-1",
		createdAt: new Date("2026-01-01"),
		isCollapsed: false,
		tabOrder: 0,
		color: null,
		workspaces: [],
		...overrides,
	};
}

export function makeProject(
	overrides: Partial<DashboardSidebarProject> & { id: string; name: string },
): DashboardSidebarProject {
	return {
		githubOwner: null,
		githubRepoName: null,
		iconUrl: null,
		color: null,
		createdAt: new Date("2026-01-01"),
		updatedAt: new Date("2026-01-01"),
		isCollapsed: false,
		children: [],
		...overrides,
	};
}
