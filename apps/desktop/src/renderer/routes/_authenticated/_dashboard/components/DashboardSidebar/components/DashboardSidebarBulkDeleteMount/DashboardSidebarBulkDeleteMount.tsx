import { useDashboardSidebarSelection } from "../../providers/DashboardSidebarSelectionProvider";
import { useBulkDeleteWorkspacesIntent } from "../../stores/bulkDeleteWorkspacesIntent";
import { DashboardSidebarBulkDeleteDialog } from "../DashboardSidebarBulkDeleteDialog";

/**
 * The single mount for the bulk delete dialog, shared by the selection
 * toolbar and the bulk row context menu. It lives at the sidebar root so it
 * outlives the rows it deletes (archive-first tombstoning drops them the
 * moment each destroy starts) and the toolbar (which unmounts once the
 * selection empties). The request's phase and failures live in the store, so
 * even the sidebar unmounting (toggled closed) mid-run only hides the dialog
 * until it is back. `key` gives every request a fresh dialog instance so no
 * inspection state leaks between requests.
 */
export function DashboardSidebarBulkDeleteMount() {
	const requestId = useBulkDeleteWorkspacesIntent((s) => s.requestId);
	const targets = useBulkDeleteWorkspacesIntent((s) => s.targets);
	const { removeSelectedWorkspaces } = useDashboardSidebarSelection();

	if (targets.length === 0) return null;
	return (
		<DashboardSidebarBulkDeleteDialog
			key={requestId}
			requestId={requestId}
			workspaces={targets}
			onDeleted={removeSelectedWorkspaces}
		/>
	);
}
