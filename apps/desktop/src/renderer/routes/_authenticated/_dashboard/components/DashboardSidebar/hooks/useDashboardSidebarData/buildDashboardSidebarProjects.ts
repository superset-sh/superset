import type { WorkspaceTransactionSnapshot } from "renderer/stores/workspace-creates";
import { getV2WorkspaceDisplayName } from "renderer/utils/getV2WorkspaceDisplayName";
import type {
	DashboardSidebarPinnedWorkspace,
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
	pinnedAt: number | null;
	pendingTransaction: WorkspaceTransactionSnapshot | null;
}

/**
 * Splits the visible rows into pinned (sorted by pin time ascending, so new
 * pins append at the bottom of the Pinned section) and everything else. The
 * caller feeds `unpinned` to {@link buildDashboardSidebarProjects} and
 * `pinned` to {@link buildDashboardSidebarPinnedWorkspaces} — a pinned
 * workspace renders only in the Pinned section, never in its project group.
 */
export function partitionSidebarWorkspacesByPinned<
	Workspace extends { pinnedAt: number | null },
>(workspaces: Workspace[]): { pinned: Workspace[]; unpinned: Workspace[] } {
	const pinned: Workspace[] = [];
	const unpinned: Workspace[] = [];
	for (const workspace of workspaces) {
		(workspace.pinnedAt != null ? pinned : unpinned).push(workspace);
	}
	pinned.sort((left, right) => (left.pinnedAt ?? 0) - (right.pinnedAt ?? 0));
	return { pinned, unpinned };
}

function decorateSidebarWorkspace(
	workspace: SidebarWorkspaceInput,
	project: Pick<SidebarProjectInput, "githubOwner" | "githubRepoName">,
	machineId: string,
	pullRequestsByWorkspaceId: Map<string, SidebarPullRequest>,
	agentActivityByWorkspaceId: Map<string, number>,
): DashboardSidebarWorkspace {
	const hostType: DashboardSidebarWorkspace["hostType"] =
		workspace.hostId === machineId ? "local-device" : "remote-device";

	return {
		id: workspace.id,
		projectId: workspace.projectId,
		hostId: workspace.hostId,
		hostType,
		type: workspace.type,
		hostIsOnline: hostType === "remote-device" ? workspace.hostIsOnline : null,
		accentColor: null,
		name: getV2WorkspaceDisplayName(workspace),
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
		lastAgentActivityAt: agentActivityByWorkspaceId.get(workspace.id) ?? null,
		taskId: workspace.taskId,
		isPinned: workspace.pinnedAt != null,
		pendingTransaction: workspace.pendingTransaction,
	};
}

/**
 * Decorates pinned rows for the sidebar's top-level Pinned section. Rows keep
 * their partition order (pin time ascending). A pinned workspace whose project
 * is no longer in the sidebar is dropped, matching how
 * {@link buildDashboardSidebarProjects} treats project-less rows.
 */
export function buildDashboardSidebarPinnedWorkspaces({
	pinnedSidebarWorkspaces,
	sidebarProjects,
	machineId,
	pullRequestsByWorkspaceId,
	agentActivityByWorkspaceId,
}: {
	pinnedSidebarWorkspaces: SidebarWorkspaceInput[];
	sidebarProjects: SidebarProjectInput[];
	machineId: string;
	pullRequestsByWorkspaceId: Map<string, SidebarPullRequest>;
	agentActivityByWorkspaceId: Map<string, number>;
}): DashboardSidebarPinnedWorkspace[] {
	const projectsById = new Map(
		sidebarProjects.map((project) => [project.id, project]),
	);
	return pinnedSidebarWorkspaces.flatMap((workspace) => {
		const project = projectsById.get(workspace.projectId);
		if (!project) return [];
		return [
			{
				...decorateSidebarWorkspace(
					workspace,
					project,
					machineId,
					pullRequestsByWorkspaceId,
					agentActivityByWorkspaceId,
				),
				projectName: project.name,
				projectIconUrl: project.iconUrl,
			},
		];
	});
}

export interface BuildDashboardSidebarProjectsParams {
	sidebarProjects: SidebarProjectInput[];
	sidebarSections: SidebarSectionInput[];
	visibleSidebarWorkspaces: SidebarWorkspaceInput[];
	machineId: string;
	pullRequestsByWorkspaceId: Map<string, SidebarPullRequest>;
	agentActivityByWorkspaceId: Map<string, number>;
}

export function buildDashboardSidebarProjects({
	sidebarProjects,
	sidebarSections,
	visibleSidebarWorkspaces,
	machineId,
	pullRequestsByWorkspaceId,
	agentActivityByWorkspaceId,
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

		const sidebarWorkspace = decorateSidebarWorkspace(
			workspace,
			project,
			machineId,
			pullRequestsByWorkspaceId,
			agentActivityByWorkspaceId,
		);

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

	return sidebarProjects.flatMap((project) => {
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
}
