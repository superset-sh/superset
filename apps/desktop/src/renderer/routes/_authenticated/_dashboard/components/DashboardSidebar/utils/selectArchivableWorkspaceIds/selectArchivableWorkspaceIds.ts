import type { DashboardSidebarWorkspace } from "../../types";

/**
 * The subset of a selection that can be archived: main workspaces never
 * are, and cloud sandboxes keep their delete path. Shared by the selection
 * toolbar and the bulk row context menu so both agree.
 */
export function selectArchivableWorkspaceIds(
	workspaces: readonly Pick<
		DashboardSidebarWorkspace,
		"id" | "type" | "hostType"
	>[],
): string[] {
	return workspaces
		.filter(
			(workspace) =>
				workspace.type !== "main" && workspace.hostType !== "cloud",
		)
		.map((workspace) => workspace.id);
}
