import type { WorkspaceTransactionSnapshot } from "renderer/stores/workspace-creates";
import { getV2WorkspaceDisplayName } from "renderer/utils/getV2WorkspaceDisplayName";
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
	parentWorkspaceId: string | null;
	hostIsOnline: boolean;
	name: string;
	branch: string;
	taskId: string | null;
	createdAt: Date;
	updatedAt: Date;
	tabOrder: number;
	sectionId: string | null;
	pendingTransaction: WorkspaceTransactionSnapshot | null;
}

export interface BuildDashboardSidebarProjectsParams {
	sidebarProjects: SidebarProjectInput[];
	sidebarSections: SidebarSectionInput[];
	visibleSidebarWorkspaces: SidebarWorkspaceInput[];
	machineId: string;
	pullRequestsByWorkspaceId: Map<string, SidebarPullRequest>;
}

/** Keep each visible subworkspace tree adjacent to its top-level parent. */
function orderSubWorkspacesAfterParents(
	workspaces: DashboardSidebarWorkspace[],
): DashboardSidebarWorkspace[] {
	const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
	const childrenByParentId = new Map<string, DashboardSidebarWorkspace[]>();
	const roots: DashboardSidebarWorkspace[] = [];

	for (const workspace of workspaces) {
		if (
			workspace.type !== "subworkspace" ||
			!workspace.parentWorkspaceId ||
			!workspaceIds.has(workspace.parentWorkspaceId)
		) {
			roots.push(workspace);
			continue;
		}
		const siblings = childrenByParentId.get(workspace.parentWorkspaceId) ?? [];
		siblings.push(workspace);
		childrenByParentId.set(workspace.parentWorkspaceId, siblings);
	}

	const ordered: DashboardSidebarWorkspace[] = [];
	/** Append one workspace followed by its visible descendants. */
	const appendTree = (workspace: DashboardSidebarWorkspace) => {
		ordered.push(workspace);
		for (const child of childrenByParentId.get(workspace.id) ?? []) {
			appendTree(child);
		}
	};
	for (const root of roots) appendTree(root);

	return ordered;
}

export function buildDashboardSidebarProjects({
	sidebarProjects,
	sidebarSections,
	visibleSidebarWorkspaces,
	machineId,
	pullRequestsByWorkspaceId,
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
			parentWorkspaceId: workspace.parentWorkspaceId,
			hostIsOnline:
				hostType === "remote-device" ? workspace.hostIsOnline : null,
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
			taskId: workspace.taskId,
			pendingTransaction: workspace.pendingTransaction,
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

		for (const child of children) {
			if (child.type === "section") {
				child.section.workspaces = orderSubWorkspacesAfterParents(
					child.section.workspaces,
				);
			}
		}

		const orderedChildren: DashboardSidebarProjectChild[] = [];
		const topLevelWorkspaces: DashboardSidebarWorkspace[] = [];
		/** Flush one contiguous workspace group without crossing section rows. */
		const flushTopLevelWorkspaces = () => {
			orderedChildren.push(
				...orderSubWorkspacesAfterParents(topLevelWorkspaces).map(
					(workspace) => ({ type: "workspace" as const, workspace }),
				),
			);
			topLevelWorkspaces.length = 0;
		};
		for (const child of children) {
			if (child.type === "workspace") {
				topLevelWorkspaces.push(child.workspace);
				continue;
			}
			flushTopLevelWorkspaces();
			orderedChildren.push(child);
		}
		flushTopLevelWorkspaces();

		sidebarProject.children = orderedChildren;
		return [sidebarProject];
	});
}
