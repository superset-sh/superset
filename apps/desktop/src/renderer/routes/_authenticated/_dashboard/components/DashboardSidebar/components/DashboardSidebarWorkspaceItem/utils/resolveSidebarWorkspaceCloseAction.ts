import type { DashboardSidebarWorkspace } from "../../../types";

export type SidebarWorkspaceCloseAction = "dismiss" | "open-delete-dialog";

// Any non-null creationStatus means the row is an in-flight entry from the
// workspace-creates store, not a real cloud workspace — there's nothing to
// delete via the destroy flow, so the close button must dismiss the entry
// from the local store. Previously only "failed" entries were dismissable,
// which left "creating" rows stuck on screen with no way to close them when
// the host mutation never resolved (issue #4415).
export function resolveSidebarWorkspaceCloseAction(
	creationStatus: DashboardSidebarWorkspace["creationStatus"],
): SidebarWorkspaceCloseAction {
	if (creationStatus) return "dismiss";
	return "open-delete-dialog";
}
