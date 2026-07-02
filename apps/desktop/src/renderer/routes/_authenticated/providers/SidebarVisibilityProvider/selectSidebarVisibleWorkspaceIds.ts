import {
	getSidebarWorkspaceIsHidden,
	isAutoIncludedLocalMainWorkspace,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

export interface SidebarVisibilityLocalStateWorkspace {
	id: string;
	projectId: string;
	isHidden?: boolean | null;
}

export interface SidebarVisibilityMainWorkspace {
	id: string;
	projectId: string;
	hostId: string;
}

/**
 * The set of workspace ids that actually render in the v2 dashboard sidebar:
 * non-hidden workspaces the user placed under a pinned project, plus local
 * `main` workspaces auto-included before their sidebar-state row is backfilled.
 *
 * This is the single definition of "in the sidebar," shared by the sidebar tree
 * (gates its rendered workspaces on this), the ports list, and notifications, so
 * the three cannot drift. It intentionally reuses the same predicates the tree
 * builder uses (`isAutoIncludedLocalMainWorkspace`, `getSidebarWorkspaceIsHidden`)
 * and mirrors its membership rule: a workspace appears iff it is not hidden and
 * its project is pinned — section placement (or a dangling section) does not
 * change membership.
 *
 * Pure so the policy is unit-testable without collections or React.
 */
export function selectSidebarVisibleWorkspaceIds({
	localStateWorkspaces,
	mainWorkspaces,
	sidebarProjectIds,
	machineId,
}: {
	localStateWorkspaces: SidebarVisibilityLocalStateWorkspace[];
	mainWorkspaces: SidebarVisibilityMainWorkspace[];
	sidebarProjectIds: ReadonlySet<string>;
	machineId: string | null;
}): Set<string> {
	const localStateWorkspaceIds = new Set(
		localStateWorkspaces.map((workspace) => workspace.id),
	);
	const visibleIds = new Set<string>();

	for (const workspace of localStateWorkspaces) {
		if (getSidebarWorkspaceIsHidden(workspace)) continue;
		if (!sidebarProjectIds.has(workspace.projectId)) continue;
		visibleIds.add(workspace.id);
	}

	for (const workspace of mainWorkspaces) {
		if (
			isAutoIncludedLocalMainWorkspace(workspace, {
				localStateWorkspaceIds,
				sidebarProjectIds,
				machineId,
			})
		) {
			visibleIds.add(workspace.id);
		}
	}

	return visibleIds;
}
