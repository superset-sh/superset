type SidebarWorkspaceVisibilitySource =
	| { isHidden?: boolean | null }
	| { sidebarState: { isHidden?: boolean | null } };

export function getSidebarWorkspaceIsHidden(
	workspace: SidebarWorkspaceVisibilitySource,
): boolean {
	if ("sidebarState" in workspace) {
		return workspace.sidebarState.isHidden === true;
	}
	return workspace.isHidden === true;
}

export function isSidebarWorkspaceVisible(
	workspace: SidebarWorkspaceVisibilitySource,
): boolean {
	return !getSidebarWorkspaceIsHidden(workspace);
}

export function getVisibleSidebarWorkspaces<
	Workspace extends SidebarWorkspaceVisibilitySource,
>(workspaces: readonly Workspace[]): Workspace[] {
	return workspaces.filter(isSidebarWorkspaceVisible);
}

/**
 * A `main` workspace is auto-included in the sidebar when the user hasn't
 * explicitly placed it (no local-state row), it lives on this machine, and its
 * project is one the user added to their sidebar. Shared by the sidebar tree
 * builder and the notification/ports visibility filters so they agree on what
 * "in the sidebar" means.
 */
export function isAutoIncludedLocalMainWorkspace(
	workspace: { id: string; hostId: string; projectId: string },
	{
		localStateWorkspaceIds,
		sidebarProjectIds,
		machineId,
	}: {
		localStateWorkspaceIds: ReadonlySet<string>;
		sidebarProjectIds: ReadonlySet<string>;
		machineId: string | null;
	},
): boolean {
	return (
		!localStateWorkspaceIds.has(workspace.id) &&
		workspace.hostId === machineId &&
		sidebarProjectIds.has(workspace.projectId)
	);
}

/**
 * Finds host-owned delegated workspaces that should follow a visible parent
 * into the sidebar. An explicit local-state row always wins: a user-hidden
 * child stays hidden, while an explicitly placed child is already in the
 * visible seed set.
 */
export function getAutoIncludedSubWorkspaceIds(
	workspaces: ReadonlyArray<{
		id: string;
		projectId: string;
		type?: "main" | "worktree" | "subworkspace";
		parentWorkspaceId?: string | null;
	}>,
	{
		localStateWorkspaceIds,
		sidebarProjectIds,
		visibleWorkspaceIds,
	}: {
		localStateWorkspaceIds: ReadonlySet<string>;
		sidebarProjectIds: ReadonlySet<string>;
		visibleWorkspaceIds: ReadonlySet<string>;
	},
): Set<string> {
	const visibleIds = new Set(visibleWorkspaceIds);
	const autoIncludedIds = new Set<string>();
	let changed = true;

	while (changed) {
		changed = false;
		for (const workspace of workspaces) {
			if (
				workspace.type !== "subworkspace" ||
				!workspace.parentWorkspaceId ||
				visibleIds.has(workspace.id) ||
				localStateWorkspaceIds.has(workspace.id) ||
				!sidebarProjectIds.has(workspace.projectId) ||
				!visibleIds.has(workspace.parentWorkspaceId)
			) {
				continue;
			}
			visibleIds.add(workspace.id);
			autoIncludedIds.add(workspace.id);
			changed = true;
		}
	}

	return autoIncludedIds;
}
