import type { WorkspaceTransactionSnapshot } from "renderer/stores/workspace-creates";
import type {
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
	DashboardSidebarWorkspacePullRequest,
	DashboardSidebarWorkspaceType,
} from "../../types";

export interface SidebarGroupProjectInput {
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
}

export interface SidebarGroupSectionInput {
	id: string;
	projectId: string;
	name: string;
	createdAt: Date;
	isCollapsed: boolean;
	tabOrder: number;
	color: string | null;
}

export interface SidebarGroupWorkspaceInput {
	id: string;
	projectId: string;
	hostId: string;
	type: DashboardSidebarWorkspaceType;
	name: string;
	branch: string;
	taskId: string | null;
	createdAt: Date;
	updatedAt: Date;
	hostIsOnline: boolean;
	tabOrder: number;
	sectionId: string | null;
	pendingTransaction: WorkspaceTransactionSnapshot | null;
}

export interface BuildDashboardSidebarGroupsParams {
	sidebarProjects: SidebarGroupProjectInput[];
	sidebarSections: SidebarGroupSectionInput[];
	visibleSidebarWorkspaces: SidebarGroupWorkspaceInput[];
	machineId: string | null;
	pullRequestsByWorkspaceId: Map<
		string,
		DashboardSidebarWorkspacePullRequest | null
	>;
}

export function buildDashboardSidebarGroups({
	sidebarProjects,
	sidebarSections,
	visibleSidebarWorkspaces,
	machineId,
	pullRequestsByWorkspaceId,
}: BuildDashboardSidebarGroupsParams): DashboardSidebarProject[] {
	const projectsById = new Map<
		string,
		DashboardSidebarProject & {
			sectionMap: Map<string, DashboardSidebarSection>;
			childEntries: Array<{
				tabOrder: number;
				child: DashboardSidebarProjectChild;
			}>;
		}
	>();

	for (const project of sidebarProjects) {
		projectsById.set(project.id, {
			...project,
			children: [],
			sectionMap: new Map(),
			childEntries: [],
		});
	}

	for (const section of sidebarSections) {
		const project = projectsById.get(section.projectId);
		if (!project) continue;

		const sidebarSection: DashboardSidebarSection = {
			...section,
			workspaces: [],
		};

		project.sectionMap.set(section.id, sidebarSection);
		project.childEntries.push({
			tabOrder: section.tabOrder,
			child: {
				type: "section",
				section: sidebarSection,
			},
		});
	}

	for (const workspace of visibleSidebarWorkspaces) {
		const project = projectsById.get(workspace.projectId);
		if (!project) continue;

		const hostType: DashboardSidebarWorkspace["hostType"] =
			workspace.hostId === machineId ? "local-device" : "remote-device";

		const sidebarWorkspace: DashboardSidebarWorkspace = {
			id: workspace.id,
			projectId: workspace.projectId,
			hostId: workspace.hostId,
			hostType,
			type: workspace.type,
			hostIsOnline:
				hostType === "remote-device" ? workspace.hostIsOnline : null,
			accentColor: null,
			name: workspace.name,
			branch: workspace.branch,
			pullRequest: pullRequestsByWorkspaceId.get(workspace.id) ?? null,
			repoUrl:
				project.githubOwner && project.githubRepoName
					? `https://github.com/${project.githubOwner}/${project.githubRepoName}`
					: null,
			branchExistsOnRemote:
				project.githubOwner !== null && project.githubRepoName !== null,
			previewUrl: null,
			needsRebase: null,
			behindCount: null,
			createdAt: workspace.createdAt,
			updatedAt: workspace.updatedAt,
			taskId: workspace.taskId,
			pendingTransaction: workspace.pendingTransaction,
		};

		// A workspace may reference a sectionId whose section no longer exists in
		// this project — for example a section deleted on another device whose
		// removal has synced before the workspace's own sidebar-state update, or
		// any cross-collection inconsistency between sections and workspace state.
		// Only route it into a section when that section actually resolves;
		// otherwise fall through and render it as a top-level workspace so it can
		// never silently disappear from the sidebar.
		if (workspace.sectionId) {
			const section = project.sectionMap.get(workspace.sectionId);
			if (section) {
				section.workspaces.push({
					...sidebarWorkspace,
					accentColor: section.color,
				});
				continue;
			}
		}

		project.childEntries.push({
			tabOrder: workspace.tabOrder,
			child: {
				type: "workspace",
				workspace: sidebarWorkspace,
			},
		});
	}

	return sidebarProjects.flatMap((project) => {
		const resolvedProject = projectsById.get(project.id);
		if (!resolvedProject) return [];
		const {
			childEntries,
			sectionMap: _sectionMap,
			...sidebarProject
		} = resolvedProject;

		const isLocalMain = (entry: (typeof childEntries)[number]) =>
			entry.child.type === "workspace" &&
			entry.child.workspace.type === "main" &&
			entry.child.workspace.hostType === "local-device";

		const sortedChildren = childEntries
			.sort((left, right) => {
				const leftLocalMain = isLocalMain(left);
				const rightLocalMain = isLocalMain(right);
				if (leftLocalMain !== rightLocalMain) {
					return leftLocalMain ? -1 : 1;
				}
				return left.tabOrder - right.tabOrder;
			})
			.map(({ child }) => child);

		// Ungrouped workspaces rendered after a section header are visually
		// grouped with that section (shared accent, collapse-together) and will
		// be committed into it on next DnD. Reparent them here so section counts
		// match what the user sees.
		const children: DashboardSidebarProjectChild[] = [];
		let currentSection: DashboardSidebarSection | null = null;
		for (const child of sortedChildren) {
			if (child.type === "section") {
				currentSection = child.section;
				children.push(child);
			} else if (currentSection) {
				currentSection.workspaces.push({
					...child.workspace,
					accentColor: currentSection.color,
				});
			} else {
				children.push(child);
			}
		}
		sidebarProject.children = children;
		return [sidebarProject];
	});
}
