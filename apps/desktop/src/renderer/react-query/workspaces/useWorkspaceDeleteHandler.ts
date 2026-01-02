import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useDeleteWorkspace } from "./useDeleteWorkspace";

interface UseWorkspaceDeleteHandlerParams {
	id: string;
	name: string;
	type: "worktree" | "branch";
}

interface UseWorkspaceDeleteHandlerResult {
	/** Whether the delete dialog should be shown */
	showDeleteDialog: boolean;
	/** Set whether the delete dialog should be shown */
	setShowDeleteDialog: (show: boolean) => void;
	/** Handle delete click - checks conditions and either deletes directly or shows dialog */
	handleDeleteClick: (e?: React.MouseEvent) => Promise<void>;
	/** Whether a delete operation is pending */
	isPending: boolean;
}

/**
 * Shared hook for workspace delete logic.
 * Handles the decision of whether to show confirmation dialog or delete directly.
 *
 * For branch workspaces: Shows dialog only if there are active terminals
 * For worktree workspaces: Shows dialog if there are changes, unpushed commits, or terminals
 */
export function useWorkspaceDeleteHandler({
	id,
	name,
	type,
}: UseWorkspaceDeleteHandlerParams): UseWorkspaceDeleteHandlerResult {
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const deleteWorkspace = useDeleteWorkspace();
	const isBranchWorkspace = type === "branch";

	const canDeleteQuery = trpc.workspaces.canDelete.useQuery(
		{ id },
		{ enabled: false },
	);

	const handleDeleteClick = async (e?: React.MouseEvent) => {
		e?.stopPropagation();

		if (deleteWorkspace.isPending || canDeleteQuery.isFetching) return;

		try {
			const { data: canDeleteData } = await canDeleteQuery.refetch();

			if (isBranchWorkspace) {
				// Show dialog if we couldn't get data (safe default) or there are active terminals
				if (
					!canDeleteData ||
					(canDeleteData.activeTerminalCount &&
						canDeleteData.activeTerminalCount > 0)
				) {
					setShowDeleteDialog(true);
				} else {
					toast.promise(deleteWorkspace.mutateAsync({ id }), {
						loading: `Closing "${name}"...`,
						success: `Workspace "${name}" closed`,
						error: (error) =>
							error instanceof Error
								? `Failed to close workspace: ${error.message}`
								: "Failed to close workspace",
					});
				}
				return;
			}

			// Only skip dialog if we have data confirming it's safe to delete
			const isEmpty =
				canDeleteData?.canDelete &&
				canDeleteData.activeTerminalCount === 0 &&
				!canDeleteData.warning &&
				!canDeleteData.hasChanges &&
				!canDeleteData.hasUnpushedCommits;

			if (isEmpty) {
				toast.promise(deleteWorkspace.mutateAsync({ id }), {
					loading: `Deleting "${name}"...`,
					success: `Workspace "${name}" deleted`,
					error: (error) =>
						error instanceof Error
							? `Failed to delete workspace: ${error.message}`
							: "Failed to delete workspace",
				});
			} else {
				setShowDeleteDialog(true);
			}
		} catch {
			setShowDeleteDialog(true);
		}
	};

	return {
		showDeleteDialog,
		setShowDeleteDialog,
		handleDeleteClick,
		isPending: deleteWorkspace.isPending || canDeleteQuery.isFetching,
	};
}
