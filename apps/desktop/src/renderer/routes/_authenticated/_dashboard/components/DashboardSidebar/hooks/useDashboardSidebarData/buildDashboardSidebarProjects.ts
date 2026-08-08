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
	/** Accent color as a `#rrggbb` hex, or null for the default. */
	color: string | null;
	createdAt: Date;
	updatedAt: Date;
	isCollapsed: boolean;
}

export interface SidebarSectionInput {
	id: string;
	/** Null scopes the group to the top-level Sessions area. */
	projectId: string | null;
	/** Non-null when this group nests inside another group. */
	parentSectionId: string | null;
	name: string;
	createdAt: Date;
	isCollapsed: boolean;
	tabOrder: number;
	color: string | null;
}

/** Corrupt trees never brick the sidebar: deeper nesting splices to root. */
const MAX_GROUP_DEPTH = 4;

/**
 * Assembles one scope's groups into a tree of DashboardSidebarSection nodes.
 * Nested groups attach to their parent's `childSections` (sorted by tabOrder);
 * a group whose parent is missing, cyclic, or beyond MAX_GROUP_DEPTH is
 * spliced to the scope root instead of being dropped.
 *
 * Returns every node keyed by id plus the root-level nodes in input order.
 */
export function buildSectionTree(sections: SidebarSectionInput[]): {
	nodesById: Map<string, DashboardSidebarSection>;
	rootSections: DashboardSidebarSection[];
} {
	const inputsById = new Map(sections.map((section) => [section.id, section]));

	// A node keeps its declared parent when that parent exists and the chain
	// doesn't loop back to the node itself. A dangling or cyclic ancestor
	// deeper up re-roots THAT ancestor, which already unblocks this node's
	// chain — so only self-cycles and missing direct parents splice here.
	const resolveParent = (section: SidebarSectionInput): string | null => {
		if (section.parentSectionId === null) return null;
		if (!inputsById.has(section.parentSectionId)) return null;
		const visited = new Set<string>([section.id]);
		let current: string | null = section.parentSectionId;
		while (current !== null) {
			if (current === section.id) return null; // self-cycle → splice
			if (visited.has(current)) break; // upstream loop — not ours to fix
			visited.add(current);
			current = inputsById.get(current)?.parentSectionId ?? null;
			if (current === section.id) return null;
		}
		return section.parentSectionId;
	};

	const nodesById = new Map<string, DashboardSidebarSection>(
		sections.map((section) => [
			section.id,
			{
				...section,
				workspaces: [],
				childSections: [],
			},
		]),
	);

	const rootSections: DashboardSidebarSection[] = [];
	for (const section of sections) {
		const node = nodesById.get(section.id);
		if (!node) continue;
		const parentId = resolveParent(section);
		node.parentSectionId = parentId;
		if (parentId === null) {
			rootSections.push(node);
		} else {
			nodesById.get(parentId)?.childSections.push(node);
		}
	}

	// Depth cap: anything nested deeper than MAX_GROUP_DEPTH re-roots (kept
	// visible, never dropped). Applied after attachment so re-rooted
	// ancestors don't double-count depth.
	const enforceDepth = (node: DashboardSidebarSection, depth: number): void => {
		const keep: DashboardSidebarSection[] = [];
		for (const child of node.childSections) {
			if (depth + 1 >= MAX_GROUP_DEPTH) {
				child.parentSectionId = null;
				rootSections.push(child);
				// The re-rooted subtree may itself exceed the cap.
				enforceDepth(child, 0);
			} else {
				keep.push(child);
				enforceDepth(child, depth + 1);
			}
		}
		node.childSections = keep;
	};
	for (const root of [...rootSections]) {
		enforceDepth(root, 0);
	}

	for (const node of nodesById.values()) {
		node.childSections.sort((left, right) => left.tabOrder - right.tabOrder);
	}
	rootSections.sort((left, right) => left.tabOrder - right.tabOrder);
	return { nodesById, rootSections };
}

export interface SidebarWorkspaceInput {
	id: string;
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
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
}: {
	pinnedSidebarWorkspaces: SidebarWorkspaceInput[];
	sidebarProjects: SidebarProjectInput[];
	machineId: string;
	pullRequestsByWorkspaceId: Map<string, SidebarPullRequest>;
}): DashboardSidebarPinnedWorkspace[] {
	const projectsById = new Map(
		sidebarProjects.map((project) => [project.id, project]),
	);
	return pinnedSidebarWorkspaces.flatMap(
		(workspace): DashboardSidebarPinnedWorkspace[] => {
			// Pinned sessions render with no project identity.
			if (workspace.projectId === null) {
				return [
					{
						...decorateSidebarWorkspace(
							workspace,
							{ githubOwner: null, githubRepoName: null },
							machineId,
							pullRequestsByWorkspaceId,
						),
						projectName: null,
						projectIconUrl: null,
					},
				];
			}
			const project = projectsById.get(workspace.projectId);
			if (!project) return [];
			return [
				{
					...decorateSidebarWorkspace(
						workspace,
						project,
						machineId,
						pullRequestsByWorkspaceId,
					),
					projectName: project.name,
					projectIconUrl: project.iconUrl,
				},
			];
		},
	);
}

export interface DashboardSidebarSessionsScope {
	/** Sessions outside any group, ordered by tabOrder. */
	looseWorkspaces: DashboardSidebarWorkspace[];
	/** Root-level session groups (tree), ordered by tabOrder. */
	rootSections: DashboardSidebarSection[];
}

/**
 * Builds the top-level Sessions area: project-less workspaces plus the
 * null-scope group tree. Sessions have no repo identity, so every
 * project-derived affordance (repoUrl, remote-branch, PRs) is null/off.
 * A session pointing at a dangling group splices to the loose lane.
 */
export function buildDashboardSidebarSessionsScope({
	sessionSidebarWorkspaces,
	sessionSections,
	machineId,
	pullRequestsByWorkspaceId,
}: {
	sessionSidebarWorkspaces: SidebarWorkspaceInput[];
	sessionSections: SidebarSectionInput[];
	machineId: string;
	pullRequestsByWorkspaceId: Map<string, SidebarPullRequest>;
}): DashboardSidebarSessionsScope {
	const { nodesById, rootSections } = buildSectionTree(sessionSections);

	const looseWorkspaces: DashboardSidebarWorkspace[] = [];
	for (const workspace of sessionSidebarWorkspaces
		.slice()
		.sort((left, right) => left.tabOrder - right.tabOrder)) {
		const decorated = decorateSidebarWorkspace(
			workspace,
			{ githubOwner: null, githubRepoName: null },
			machineId,
			pullRequestsByWorkspaceId,
		);
		const section = workspace.sectionId
			? nodesById.get(workspace.sectionId)
			: undefined;
		if (section) {
			section.workspaces.push({ ...decorated, accentColor: section.color });
		} else {
			looseWorkspaces.push(decorated);
		}
	}
	rootSections.sort((left, right) => left.tabOrder - right.tabOrder);
	return { looseWorkspaces, rootSections };
}

export interface BuildDashboardSidebarProjectsParams {
	sidebarProjects: SidebarProjectInput[];
	sidebarSections: SidebarSectionInput[];
	visibleSidebarWorkspaces: SidebarWorkspaceInput[];
	machineId: string;
	pullRequestsByWorkspaceId: Map<string, SidebarPullRequest>;
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

	// Group the section inputs per project, then build each project's tree.
	// Every node (root or nested) lands in sectionMap so workspaces can join
	// their group by id; only root nodes become top-level child entries.
	const sectionsByProject = new Map<string, SidebarSectionInput[]>();
	for (const section of sidebarSections) {
		if (section.projectId === null) continue; // sessions scope, built separately
		if (!projectsById.has(section.projectId)) continue;
		const list = sectionsByProject.get(section.projectId) ?? [];
		list.push(section);
		sectionsByProject.set(section.projectId, list);
	}
	for (const [projectId, projectSections] of sectionsByProject) {
		const project = projectsById.get(projectId);
		if (!project) continue;
		const { nodesById, rootSections } = buildSectionTree(projectSections);
		for (const [sectionId, node] of nodesById) {
			project.sectionMap.set(sectionId, node);
		}
		for (const section of rootSections) {
			project.childEntries.push({
				tabOrder: section.tabOrder,
				child: {
					type: "section",
					section,
				},
			});
		}
	}

	for (const workspace of visibleSidebarWorkspaces) {
		// Sessions render in the top-level Sessions section, never in a
		// project group (see buildDashboardSidebarSessionWorkspaces).
		if (workspace.projectId === null) continue;
		const project = projectsById.get(workspace.projectId);
		if (!project) continue;

		const sidebarWorkspace = decorateSidebarWorkspace(
			workspace,
			project,
			machineId,
			pullRequestsByWorkspaceId,
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
