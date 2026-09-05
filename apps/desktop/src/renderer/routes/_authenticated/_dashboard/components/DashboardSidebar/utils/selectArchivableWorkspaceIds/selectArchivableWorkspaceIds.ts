import type { DashboardSidebarWorkspace } from "../../types";

/**
 * Whether a sidebar workspace can be archived: main workspaces never are,
 * and cloud sandboxes keep their delete path. The one place the rule lives
 * for sidebar-shaped rows (the archive flow re-checks against the host
 * cache with `isSandboxHost`, since it sees host rows, not sidebar rows).
 */
export function isArchivableWorkspace(
	workspace: Pick<DashboardSidebarWorkspace, "type" | "hostType">,
): boolean {
	return workspace.type !== "main" && workspace.hostType !== "cloud";
}

/** The archivable subset of a selection, as ids. */
export function selectArchivableWorkspaceIds(
	workspaces: readonly Pick<
		DashboardSidebarWorkspace,
		"id" | "type" | "hostType"
	>[],
): string[] {
	return workspaces
		.filter(isArchivableWorkspace)
		.map((workspace) => workspace.id);
}
