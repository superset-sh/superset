import type { DashboardSidebarWorkspaceSort } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { type ActivePaneStatus, STATUS_PRIORITY } from "shared/tabs-types";
import type {
	DashboardSidebarProjectChild,
	DashboardSidebarWorkspace,
} from "../../types";

type WorkspaceStatuses = ReadonlyMap<string, ActivePaneStatus | null>;

function isPinnedMainWorkspace(workspace: DashboardSidebarWorkspace): boolean {
	return workspace.type === "main" && workspace.hostType === "local-device";
}

function compareWorkspaceNames(
	left: DashboardSidebarWorkspace,
	right: DashboardSidebarWorkspace,
): number {
	return (
		left.name.localeCompare(right.name, undefined, {
			numeric: true,
			sensitivity: "base",
		}) || left.id.localeCompare(right.id)
	);
}

function compareWorkspaces(
	left: DashboardSidebarWorkspace,
	right: DashboardSidebarWorkspace,
	sortOrder: Exclude<DashboardSidebarWorkspaceSort, "manual">,
	statuses: WorkspaceStatuses,
): number {
	const leftIsPinned = isPinnedMainWorkspace(left);
	const rightIsPinned = isPinnedMainWorkspace(right);
	if (leftIsPinned !== rightIsPinned) return leftIsPinned ? -1 : 1;

	if (sortOrder === "status") {
		const statusDelta =
			STATUS_PRIORITY[statuses.get(right.id) ?? "idle"] -
			STATUS_PRIORITY[statuses.get(left.id) ?? "idle"];
		if (statusDelta !== 0) return statusDelta;

		const createdDelta = right.createdAt.getTime() - left.createdAt.getTime();
		if (createdDelta !== 0) return createdDelta;
	}

	if (sortOrder === "created-desc") {
		const createdDelta = right.createdAt.getTime() - left.createdAt.getTime();
		if (createdDelta !== 0) return createdDelta;
	}

	if (sortOrder === "created-asc") {
		const createdDelta = left.createdAt.getTime() - right.createdAt.getTime();
		if (createdDelta !== 0) return createdDelta;
	}

	return compareWorkspaceNames(left, right);
}

/**
 * Applies a project-level viewing order without mutating its persisted manual
 * order or moving workspaces across group boundaries.
 */
export function sortProjectChildren(
	children: DashboardSidebarProjectChild[],
	sortOrder: DashboardSidebarWorkspaceSort,
	statuses: WorkspaceStatuses,
): DashboardSidebarProjectChild[] {
	if (sortOrder === "manual") return children;

	const compare = (
		left: DashboardSidebarWorkspace,
		right: DashboardSidebarWorkspace,
	) => compareWorkspaces(left, right, sortOrder, statuses);
	const topLevelWorkspaces = children
		.flatMap((child) => (child.type === "workspace" ? [child.workspace] : []))
		.sort(compare);
	let topLevelIndex = 0;

	return children.map((child) => {
		if (child.type === "workspace") {
			const workspace = topLevelWorkspaces[topLevelIndex++];
			return { type: "workspace", workspace };
		}

		return {
			type: "section",
			section: {
				...child.section,
				workspaces: [...child.section.workspaces].sort(compare),
			},
		};
	});
}
