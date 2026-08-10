import { DashboardSidebarDeleteDialog } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarDeleteDialog";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";

/**
 * The single mount for the v2 delete dialog, shared by every entry point
 * (sidebar rows, board cards, command palette, close-workspace hotkey,
 * missing-worktree screen). The destroy pipeline archives the row first, so
 * the row — and anything mounted under it — unmounts the instant the destroy
 * starts; this mount lives at the dashboard layout level and survives that,
 * keeping the teardown-failure force-retry pane reachable. Closing the
 * dialog only flips `open` (the target stays latched) so the in-flight
 * destroy can re-open it on failure; `key` gives each workspace a fresh
 * dialog instance so no error/preview state leaks between targets.
 */
export function DeleteWorkspaceMount() {
	const target = useDeleteWorkspaceIntent((s) => s.target);
	const open = useDeleteWorkspaceIntent((s) => s.open);
	const setOpen = useDeleteWorkspaceIntent((s) => s.setOpen);
	const close = useDeleteWorkspaceIntent((s) => s.close);
	const { removeWorkspaceFromSidebar } = useDashboardSidebarState();

	if (!target) return null;
	// Callbacks bind the rendered target's id: a dialog whose destroy is
	// still in flight after a new request replaced the target keeps its own
	// id, so its settle can't touch the new target's dialog.
	const workspaceId = target.workspaceId;
	return (
		<DashboardSidebarDeleteDialog
			key={workspaceId}
			workspaceId={workspaceId}
			workspaceName={target.workspaceName}
			open={open}
			onOpenChange={(next) => setOpen(workspaceId, next)}
			onDeleted={() => {
				removeWorkspaceFromSidebar(workspaceId);
				close(workspaceId);
			}}
		/>
	);
}
