import { useCallback, useState } from "react";
import type { DashboardSidebarWorkspace } from "../../types";

interface UseBulkWorkspaceDeleteDialogOptions {
	selectedWorkspaces: DashboardSidebarWorkspace[];
	onDeleted: (workspaceIds: string[]) => void;
}

export function useBulkWorkspaceDeleteDialog({
	selectedWorkspaces,
	onDeleted,
}: UseBulkWorkspaceDeleteDialogOptions) {
	const [deleteTargets, setDeleteTargets] = useState<
		DashboardSidebarWorkspace[]
	>([]);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

	const openDeleteDialog = useCallback(() => {
		setDeleteTargets(selectedWorkspaces);
		setIsDeleteDialogOpen(true);
	}, [selectedWorkspaces]);

	const handleDeleteDialogOpenChange = useCallback((open: boolean) => {
		setIsDeleteDialogOpen(open);
		if (!open) setDeleteTargets([]);
	}, []);

	return {
		openDeleteDialog,
		deleteDialogProps: {
			workspaces: deleteTargets,
			open: isDeleteDialogOpen,
			onOpenChange: handleDeleteDialogOpenChange,
			onDeleted,
		},
	};
}
