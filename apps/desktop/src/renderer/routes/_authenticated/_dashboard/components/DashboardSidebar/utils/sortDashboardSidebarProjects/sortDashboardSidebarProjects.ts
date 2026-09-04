import type { SidebarProjectSortMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type {
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
	DashboardSidebarWorkspace,
} from "../../types";
import { getProjectChildrenWorkspaces } from "../projectChildren";

// Timestamps are typed as Date but can arrive as ISO strings at runtime
// (IndexedDB snapshots, persisted query caches). Sorting is cosmetic, so
// coerce instead of trusting the type — a bad value must never throw
// mid-render and take the sidebar down with it (that is what got the first
// version of this feature reverted).
function toTime(value: Date | string | number | null | undefined): number {
	if (value == null) return Number.NaN;
	if (value instanceof Date) return value.getTime();
	if (typeof value === "number") return value;
	return new Date(value).getTime();
}

// An item with no usable timestamp sinks below everything dated. Mapping
// NaN to -Infinity keeps the comparator a consistent total order instead of
// interleaving unknowns by name.
function rankTime(time: number): number {
	return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function newest(times: number[]): number {
	const known = times.filter((time) => !Number.isNaN(time));
	return known.length > 0 ? Math.max(...known) : Number.NaN;
}

/**
 * When a workspace was last active. The host stamps `lastActivityAt` on
 * agent lifecycle events and it alone ranks the row once present; only rows
 * from a host that predates the column fall back to `updatedAt`. Deliberately
 * not `max` of the two: `updatedAt` moves on renames and bulk moves, and
 * housekeeping must not jump a workspace to the top of "Last active".
 */
export function getWorkspaceActivityTime(
	workspace: DashboardSidebarWorkspace,
): number {
	const activity = workspace.lastActivityAt;
	if (typeof activity === "number" && !Number.isNaN(activity)) return activity;
	return toTime(workspace.updatedAt);
}

// A project's own updatedAt only moves on metadata patches (rename), so its
// activity is that of its most recently active workspace.
export function getProjectActivityTimestamp(
	project: DashboardSidebarProject,
): number {
	const activity = newest(
		getProjectChildrenWorkspaces(project.children).map(
			getWorkspaceActivityTime,
		),
	);
	if (!Number.isNaN(activity)) return activity;
	const updatedAt = toTime(project.updatedAt);
	return Number.isNaN(updatedAt) ? toTime(project.createdAt) : updatedAt;
}

function makeStableComparator<Item>(
	byTimestamp: (item: Item) => number,
	byName: (item: Item) => string,
	byId: (item: Item) => string,
): (left: Item, right: Item) => number {
	return (left, right) => {
		const diff = rankTime(byTimestamp(right)) - rankTime(byTimestamp(left));
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
// section's own createdAt, "active" uses its most recently active workspace
// (falling back to createdAt when empty).
function getChildTimestamp(
	child: DashboardSidebarProjectChild,
	mode: SidebarProjectSortMode,
): number {
	if (child.type === "workspace") {
		return getWorkspaceTimestamp(child.workspace, mode);
	}
	const { section } = child;
	if (mode === "created") return toTime(section.createdAt);
	const activity = newest(section.workspaces.map(getWorkspaceActivityTime));
	return Number.isNaN(activity) ? toTime(section.createdAt) : activity;
}

function isLocalMainChild(child: DashboardSidebarProjectChild): boolean {
	return (
		child.type === "workspace" &&
		child.workspace.type === "main" &&
		child.workspace.hostType === "local-device"
	);
}

function haveSameItems<Item>(left: Item[], right: Item[]): boolean {
	return (
		left.length === right.length &&
		left.every((item, index) => item === right[index])
	);
}

/**
 * Orders a project's children for a non-manual sort mode: workspaces inside
 * each section sort by the mode, sections reorder among the loose workspaces
 * by their own timestamp, and the local main workspace stays pinned first.
 * Returns the input array (and the input section objects) when nothing
 * moves, so memoized rows keep their identity.
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

	const sortedInside = children.map((child) => {
		if (child.type !== "section") return child;
		const workspaces = [...child.section.workspaces].sort(compareWorkspaces);
		return haveSameItems(workspaces, child.section.workspaces)
			? child
			: { ...child, section: { ...child.section, workspaces } };
	});

	const mains = sortedInside.filter(isLocalMainChild).sort(compareChildren);
	const rest = sortedInside
		.filter((child) => !isLocalMainChild(child))
		.sort(compareChildren);
	const sorted = [...mains, ...rest];
	return haveSameItems(sorted, children) ? children : sorted;
}

/**
 * Orders projects (and their children) for a sort mode. `manual` returns the
 * input untouched; the other modes never mutate it. A project whose children
 * are already in order keeps its identity.
 */
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
		.map((project) => {
			const children = sortDashboardSidebarProjectChildren(
				project.children,
				mode,
			);
			return children === project.children ? project : { ...project, children };
		})
		.sort(compareProjects);
}
