import { useBulkDeleteWorkspacesIntent } from "../../stores/bulkDeleteWorkspacesIntent";
import { DashboardSidebarBulkDeleteDialog } from "../DashboardSidebarBulkDeleteDialog";

/**
 * The single mount for the bulk delete dialog, shared by the sidebar's
 * selection toolbar, the bulk row context menu, and the Workspaces page's
 * Archived view. It lives at the dashboard layout level so it outlives the
 * rows it deletes (archive-first tombstoning drops them the moment each
 * destroy starts), the toolbar (which unmounts once the selection empties),
 * and the sidebar itself (toggled closed while the Archived view's "Delete
 * all" runs). The sidebar's selection needs no callback here: its provider
 * prunes ids that leave `availableWorkspaceIds`, which a deleted row does.
 * The request's phase and failures live in the store; `key` gives every
 * request a fresh dialog instance so no inspection state leaks between
 * requests.
 */
export function DashboardSidebarBulkDeleteMount() {
	const requestId = useBulkDeleteWorkspacesIntent((s) => s.requestId);
	const targets = useBulkDeleteWorkspacesIntent((s) => s.targets);

	if (targets.length === 0) return null;
	return (
		<DashboardSidebarBulkDeleteDialog
			key={requestId}
			requestId={requestId}
			workspaces={targets}
			onDeleted={noopDeleted}
		/>
	);
}

// The selection provider reconciles itself against the rows still present.
function noopDeleted(_workspaceIds: string[]): void {}
