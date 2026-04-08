import type { WorkspaceTransactionSnapshot } from "renderer/stores/workspace-creates";
import type {
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
	DashboardSidebarWorkspaceType,
} from "../../types";

type SidebarPullRequest = DashboardSidebarWorkspace["pullRequest"];

export interface SidebarProjectInput {
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

export interface SidebarSectionInput {
	id: string;
	projectId: string;
	name: string;
	createdAt: Date;
	isCollapsed: boolean;
	tabOrder: number;
	color: string | null;
}

export interface SidebarWorkspaceInput {
	id: string;
	projectId: string;
	hostId: string;
	type: DashboardSidebarWorkspaceType;
	hostIsOnline: boolean;
	name: string;
	branch: string;
	taskId: string | null;
	createdAt: Date;
	updatedAt: Date;
	tabOrder: number;
	sectionId: string | null;
	pendingTransaction: WorkspaceTransactionSnapshot | null;
	lastActivityAt?: Date | null;
}

export type SidebarSortMode = "manual" | "recent";

export interface BuildDashboardSidebarProjectsParams {
	sidebarProjects: SidebarProjectInput[];
	sidebarSections: SidebarSectionInput[];
	visibleSidebarWorkspaces: SidebarWorkspaceInput[];
	machineId: string;
	pullRequestsByWorkspaceId: Map<string, SidebarPullRequest>;
	sidebarSortMode?: SidebarSortMode;
}

export function buildDashboardSidebarProjects({
	sidebarProjects,
	sidebarSections,
	visibleSidebarWorkspaces,
	machineId,
	pullRequestsByWorkspaceId,
	sidebarSortMode,
}: BuildDashboardSidebarProjectsParams): DashboardSidebarProject[] {
	const projectsById = new Map<
		string,
		DashboardSidebarProject & {
			sectionMap: Map<string, DashboardSidebarSection>;
			childEntries: Array<{
				tabOrder: number;
				child: DashboardSidebarProjectChild;
			}>;
			orphanedWorkspaces: Array<{
				tabOrder: number;
				workspace: DashboardSidebarWorkspace;
			}>;
		}
	>();

	for (const project of sidebarProjects) {
		projectsById.set(project.id, {
			...project,
			children: [],
			sectionMap: new Map(),
			childEntries: [],
			orphanedWorkspaces: [],
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
			lastActivityAt: workspace.lastActivityAt ?? null,
		};

		if (workspace.sectionId) {
			const section = project.sectionMap.get(workspace.sectionId);
			if (section) {
				section.workspaces.push({
					...sidebarWorkspace,
					accentColor: section.color,
				});
				continue;
			}
			project.orphanedWorkspaces.push({
				tabOrder: workspace.tabOrder,
				workspace: sidebarWorkspace,
			});
			continue;
		}

		project.childEntries.push({
			tabOrder: workspace.tabOrder,
			child: {
				type: "workspace",
				workspace: sidebarWorkspace,
			},
		});
	}

	const sortByRecent = sidebarSortMode === "recent";

	const builtProjects = sidebarProjects.flatMap((project) => {
		const resolvedProject = projectsById.get(project.id);
		if (!resolvedProject) return [];
		const {
			childEntries,
			sectionMap: _sectionMap,
			orphanedWorkspaces,
			...sidebarProject
		} = resolvedProject;

		const isLocalMainWorkspace = (workspace: DashboardSidebarWorkspace) =>
			workspace.type === "main" && workspace.hostType === "local-device";

		const compareByLocalMainThenTabOrder = (
			left: { tabOrder: number; workspace: DashboardSidebarWorkspace },
			right: { tabOrder: number; workspace: DashboardSidebarWorkspace },
		) => {
			const leftLocalMain = isLocalMainWorkspace(left.workspace);
			const rightLocalMain = isLocalMainWorkspace(right.workspace);
			if (leftLocalMain !== rightLocalMain) {
				return leftLocalMain ? -1 : 1;
			}
			return left.tabOrder - right.tabOrder;
		};

		const sortedChildren = childEntries
			.sort((left, right) => {
				const leftLocalMain =
					left.child.type === "workspace" &&
					isLocalMainWorkspace(left.child.workspace);
				const rightLocalMain =
					right.child.type === "workspace" &&
					isLocalMainWorkspace(right.child.workspace);
				if (leftLocalMain !== rightLocalMain) {
					return leftLocalMain ? -1 : 1;
				}
				if (sortByRecent) {
					const leftActivity =
						left.child.type === "workspace"
							? (left.child.workspace.lastActivityAt?.getTime() ?? null)
							: null;
					const rightActivity =
						right.child.type === "workspace"
							? (right.child.workspace.lastActivityAt?.getTime() ?? null)
							: null;
					if (leftActivity !== null && rightActivity !== null) {
						return rightActivity - leftActivity;
					}
					if (leftActivity !== null) return -1;
					if (rightActivity !== null) return 1;
				}
				return left.tabOrder - right.tabOrder;
			})
			.map(({ child }) => child);

		if (sortByRecent) {
			for (const child of sortedChildren) {
				if (child.type === "section") {
					child.section.workspaces.sort((a, b) => {
						const aTime = a.lastActivityAt?.getTime() ?? null;
						const bTime = b.lastActivityAt?.getTime() ?? null;
						if (aTime !== null && bTime !== null) return bTime - aTime;
						if (aTime !== null) return -1;
						if (bTime !== null) return 1;
						return 0;
					});
				}
			}
		}

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

		if (orphanedWorkspaces.length > 0) {
			const firstSectionIndex = children.findIndex(
				(child) => child.type === "section",
			);
			const insertIndex =
				firstSectionIndex === -1 ? children.length : firstSectionIndex;
			children.splice(
				insertIndex,
				0,
				...orphanedWorkspaces
					.sort(compareByLocalMainThenTabOrder)
					.map(({ workspace }) => ({
						type: "workspace" as const,
						workspace,
					})),
			);
		}

		sidebarProject.children = children;
		return [sidebarProject];
	});

	if (sortByRecent) {
		const getMaxActivity = (
			project: DashboardSidebarProject,
		): number | null => {
			let max: number | null = null;
			for (const child of project.children) {
				const time =
					child.type === "workspace"
						? (child.workspace.lastActivityAt?.getTime() ?? null)
						: Math.max(
								...child.section.workspaces
									.map((w) => w.lastActivityAt?.getTime() ?? 0)
									.filter((t) => t > 0),
								0,
							) || null;
				if (time !== null) {
					max = max === null ? time : Math.max(max, time);
				}
			}
			return max;
		};
		builtProjects.sort((a, b) => {
			const maxA = getMaxActivity(a);
			const maxB = getMaxActivity(b);
			if (maxA !== null && maxB !== null) return maxB - maxA;
			if (maxA !== null) return -1;
			if (maxB !== null) return 1;
			return 0;
		});
	}

	return builtProjects;
}
