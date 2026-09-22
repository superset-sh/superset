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
