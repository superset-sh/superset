import type { SidebarProjectSortMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type {
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
	DashboardSidebarWorkspace,
} from "../../types";
import { getProjectChildrenWorkspaces } from "../projectChildren";

// Timestamps are typed as Date but can arrive as ISO strings at runtime
// (Electric collection rows, persisted caches). Sorting is cosmetic, so
// coerce instead of trusting the type — a bad value must never throw
// mid-render and take the sidebar down with it.
function toTime(value: Date | string | number | null | undefined): number {
	if (value == null) return Number.NaN;
	if (value instanceof Date) return value.getTime();
	return new Date(value).getTime();
}

// A workspace's updatedAt only moves on metadata writes (rename, PR links),
// so real recency also considers the newest terminal-agent event the host
// recorded for it — whichever is later wins.
function getWorkspaceActivityTime(
	workspace: DashboardSidebarWorkspace,
): number {
	const updatedAt = toTime(workspace.updatedAt);
	const agentAt = workspace.lastAgentActivityAt ?? Number.NaN;
	if (Number.isNaN(updatedAt)) return agentAt;
	if (Number.isNaN(agentAt)) return updatedAt;
	return Math.max(updatedAt, agentAt);
}

// The host only bumps a project's own updatedAt on metadata patches (e.g.
// rename), so "recent activity" comes from the workspaces inside it.
export function getProjectActivityTimestamp(
	project: DashboardSidebarProject,
): number {
	const workspaces = getProjectChildrenWorkspaces(project.children);
	if (workspaces.length === 0) {
		const updatedAt = toTime(project.updatedAt);
		return Number.isNaN(updatedAt) ? toTime(project.createdAt) : updatedAt;
	}
	return Math.max(...workspaces.map(getWorkspaceActivityTime));
}

function makeStableComparator<Item>(
	byTimestamp: (item: Item) => number,
	byName: (item: Item) => string,
	byId: (item: Item) => string,
): (left: Item, right: Item) => number {
	return (left, right) => {
		const diff = byTimestamp(right) - byTimestamp(left);
		if (!Number.isNaN(diff) && diff !== 0) return diff;
		const names = byName(left).localeCompare(byName(right));
		if (names !== 0) return names;
		return byId(left).localeCompare(byId(right));
	};
}

function getWorkspaceTimestamp(
	workspace: DashboardSidebarWorkspace,
	mode: SidebarProjectSortMode,
): number {
	return mode === "created"
		? toTime(workspace.createdAt)
		: getWorkspaceActivityTime(workspace);
}

// Mirrors the project-level rules one level down: "created" uses the
// section's own createdAt, "updated" uses its most recently updated
// workspace (falling back to createdAt when empty).
function getChildTimestamp(
	child: DashboardSidebarProjectChild,
	mode: SidebarProjectSortMode,
): number {
	if (child.type === "workspace") {
		return getWorkspaceTimestamp(child.workspace, mode);
	}
	const { section } = child;
	if (mode === "created") return toTime(section.createdAt);
	const activity = section.workspaces
		.map(getWorkspaceActivityTime)
		.filter((time) => !Number.isNaN(time));
	return activity.length > 0
		? Math.max(...activity)
		: toTime(section.createdAt);
}

function isLocalMainChild(child: DashboardSidebarProjectChild): boolean {
	return (
		child.type === "workspace" &&
		child.workspace.type === "main" &&
		child.workspace.hostType === "local-device"
	);
}

/**
 * Orders a project's children for a non-manual sort mode: workspaces inside
 * each section sort by the mode, sections reorder among the loose workspaces
 * by their own timestamp, and the local main workspace stays pinned first.
 */
export function sortDashboardSidebarProjectChildren(
	children: DashboardSidebarProjectChild[],
	mode: SidebarProjectSortMode,
): DashboardSidebarProjectChild[] {
	if (mode === "manual") return children;

	const compareWorkspaces = makeStableComparator<DashboardSidebarWorkspace>(
		(workspace) => getWorkspaceTimestamp(workspace, mode),
		(workspace) => workspace.name,
		(workspace) => workspace.id,
	);
	const compareChildren = makeStableComparator<DashboardSidebarProjectChild>(
		(child) => getChildTimestamp(child, mode),
		(child) =>
			child.type === "workspace" ? child.workspace.name : child.section.name,
		(child) =>
			child.type === "workspace" ? child.workspace.id : child.section.id,
	);

	const sortedInside = children.map((child) =>
		child.type === "section"
			? {
					...child,
					section: {
						...child.section,
						workspaces: [...child.section.workspaces].sort(compareWorkspaces),
					},
				}
			: child,
	);

	const mains = sortedInside.filter(isLocalMainChild).sort(compareChildren);
	const rest = sortedInside
		.filter((child) => !isLocalMainChild(child))
		.sort(compareChildren);
	return [...mains, ...rest];
}

export function sortDashboardSidebarProjects(
	projects: DashboardSidebarProject[],
	mode: SidebarProjectSortMode,
): DashboardSidebarProject[] {
	if (mode === "manual") return projects;

	const compareProjects = makeStableComparator<DashboardSidebarProject>(
		mode === "created"
			? (project) => toTime(project.createdAt)
			: getProjectActivityTimestamp,
		(project) => project.name,
		(project) => project.id,
	);

	return projects
		.map((project) => ({
			...project,
			children: sortDashboardSidebarProjectChildren(project.children, mode),
		}))
		.sort(compareProjects);
}
