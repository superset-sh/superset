import { useCallback } from "react";
import { DashboardSidebarDeleteDialog } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarDeleteDialog";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";

export function DeleteWorkspaceMount() {
	const target = useDeleteWorkspaceIntent((s) => s.target);
	const close = useDeleteWorkspaceIntent((s) => s.close);
	const { hideWorkspaceInSidebar } = useDashboardSidebarState();

	const handleOpenChange = useCallback(
		(open: boolean) => {
			if (!open) close();
		},
		[close],
	);

	if (!target) return null;
	return (
		<DashboardSidebarDeleteDialog
			workspaceId={target.workspaceId}
			workspaceName={target.workspaceName}
			open
			onOpenChange={handleOpenChange}
			onDeleted={() => {
				hideWorkspaceInSidebar(target.workspaceId);
				close();
			}}
		/>
	);
}
