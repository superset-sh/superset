import type { DashboardSidebarWorkspace } from "../../../types";

const CREATION_STATUS_LABELS: Record<
	NonNullable<DashboardSidebarWorkspace["creationStatus"]>,
	string
> = {
	preparing: "Preparing...",
	"generating-branch": "Generating...",
	creating: "Creating...",
	failed: "Failed",
} as const;

export function getCreationStatusText(
	status: DashboardSidebarWorkspace["creationStatus"],
): string | null {
	return status ? CREATION_STATUS_LABELS[status] : null;
}
