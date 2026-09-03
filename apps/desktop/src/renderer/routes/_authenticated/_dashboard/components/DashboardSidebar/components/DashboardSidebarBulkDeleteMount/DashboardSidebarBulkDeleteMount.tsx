import { useDashboardSidebarSelection } from "../../providers/DashboardSidebarSelectionProvider";
import { useBulkDeleteWorkspacesIntent } from "../../stores/bulkDeleteWorkspacesIntent";
import { DashboardSidebarBulkDeleteDialog } from "../DashboardSidebarBulkDeleteDialog";

/**
 * The single mount for the bulk delete dialog, shared by the selection
 * toolbar and the bulk row context menu. It lives at the sidebar root so it
 * outlives the rows it deletes (archive-first tombstoning drops them the
 * moment each destroy starts) and the toolbar (which unmounts once the
 * selection empties). `key` gives every request a fresh dialog instance so
 * no inspection or failure state leaks between requests.
 */
export function DashboardSidebarBulkDeleteMount() {
	const requestId = useBulkDeleteWorkspacesIntent((s) => s.requestId);
	const targets = useBulkDeleteWorkspacesIntent((s) => s.targets);
	const close = useBulkDeleteWorkspacesIntent((s) => s.close);
	const { removeSelectedWorkspaces } = useDashboardSidebarSelection();

	if (targets.length === 0) return null;
	return (
		<DashboardSidebarBulkDeleteDialog
			key={requestId}
			workspaces={targets}
			onClose={() => close(requestId)}
			onDeleted={removeSelectedWorkspaces}
		/>
	);
}
