import type { ActivePaneStatus } from "shared/tabs-types";
import type { DashboardSidebarWorkspace } from "../../../types";

export type WorkspaceIconPrimary = "creation-failed" | "creating" | "icon";

export interface DashboardSidebarWorkspaceIconDisplay {
	primary: WorkspaceIconPrimary;
	statusOverlay: ActivePaneStatus | null;
}

export function getDashboardSidebarWorkspaceIconDisplay({
	creationStatus,
	workspaceStatus,
}: {
	creationStatus?: DashboardSidebarWorkspace["creationStatus"];
	workspaceStatus?: ActivePaneStatus | null;
}): DashboardSidebarWorkspaceIconDisplay {
	if (creationStatus === "failed") {
		return { primary: "creation-failed", statusOverlay: null };
	}
	if (creationStatus) {
		return { primary: "creating", statusOverlay: null };
	}
	return {
		primary: "icon",
		statusOverlay: workspaceStatus ?? null,
	};
}
