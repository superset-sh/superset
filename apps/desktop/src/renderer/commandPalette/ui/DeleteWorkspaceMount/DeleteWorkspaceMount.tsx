import { useCallback } from "react";
import { DashboardSidebarDeleteDialog } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarDeleteDialog";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";

export function DeleteWorkspaceMount() {
	const target = useDeleteWorkspaceIntent((s) => s.target);
	const close = useDeleteWorkspaceIntent((s) => s.close);
	const { removeWorkspaceFromSidebar } = useDashboardSidebarState();

	const handleOpenChange = useCallback(
		(open: boolean) => {
			if (!open) close();
		},
		[close],
	);

	// Mirror the sidebar context-menu and layout delete paths: once the destroy
	// succeeds, drop the workspace's local sidebar state so a deletion triggered
	// from the command palette or the workspaces overview doesn't leave a stale
	// sidebar entry behind.
	const workspaceId = target?.workspaceId;
	const handleDeleted = useCallback(() => {
		if (workspaceId) removeWorkspaceFromSidebar(workspaceId);
	}, [workspaceId, removeWorkspaceFromSidebar]);

	if (!target) return null;
	return (
		<DashboardSidebarDeleteDialog
			workspaceId={target.workspaceId}
			workspaceName={target.workspaceName}
			open
			onOpenChange={handleOpenChange}
			onDeleted={handleDeleted}
		/>
	);
}
