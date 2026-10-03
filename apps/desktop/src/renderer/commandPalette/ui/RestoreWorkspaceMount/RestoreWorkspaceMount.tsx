import { RestoreWorkspaceDialog } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/RestoreWorkspaceDialog";
import { useRestoreWorkspaceIntent } from "renderer/stores/restore-workspace-intent";

/**
 * The single mount for the v2 restore dialog. Like delete, restore acts on
 * rows that may unmount mid-flight (the tombstone row re-renders on
 * un-archive), so this mount lives at the dashboard layout level.
 */
export function RestoreWorkspaceMount() {
	const target = useRestoreWorkspaceIntent((s) => s.target);
	const open = useRestoreWorkspaceIntent((s) => s.open);
	const setOpen = useRestoreWorkspaceIntent((s) => s.setOpen);
	const close = useRestoreWorkspaceIntent((s) => s.close);

	if (!target) return null;
	const workspaceId = target.workspaceId;
	return (
		<RestoreWorkspaceDialog
			key={workspaceId}
			workspaceId={workspaceId}
			workspaceName={target.workspaceName}
			branch={target.branch}
			hostId={target.hostId}
			open={open}
			onOpenChange={(next) => setOpen(workspaceId, next)}
			onRestored={() => close(workspaceId)}
		/>
	);
}
