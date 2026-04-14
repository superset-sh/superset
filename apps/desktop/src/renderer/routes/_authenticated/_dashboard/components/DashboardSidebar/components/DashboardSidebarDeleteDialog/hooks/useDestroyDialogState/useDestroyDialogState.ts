import { toast } from "@superset/ui/sonner";
import { useCallback, useState } from "react";
import {
	type DestroyWorkspaceError,
	useDestroyWorkspace,
} from "renderer/hooks/host-service/useDestroyWorkspace";

interface UseDestroyDialogStateOptions {
	workspaceId: string;
	workspaceName: string;
	onOpenChange: (open: boolean) => void;
	onDeleted?: () => void;
}

/**
 * Orchestrates the delete flow for `DashboardSidebarDeleteDialog`:
 * owns the branch checkbox, pending flag, error state, and a `run(force)`
 * entry point that calls `workspaceCleanup.destroy` and closes the dialog
 * on success or surfaces a typed error for the pane switch to pick up.
 */
export function useDestroyDialogState({
	workspaceId,
	workspaceName,
	onOpenChange,
	onDeleted,
}: UseDestroyDialogStateOptions) {
	const { destroy } = useDestroyWorkspace(workspaceId);

	const [deleteBranch, setDeleteBranch] = useState(false);
	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<DestroyWorkspaceError | null>(null);

	const reset = useCallback(() => {
		setDeleteBranch(false);
		setIsPending(false);
		setError(null);
	}, []);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			if (isPending) return;
			if (!next) reset();
			onOpenChange(next);
		},
		[isPending, reset, onOpenChange],
	);

	const clearError = useCallback(() => setError(null), []);

	const run = useCallback(
		async (force: boolean) => {
			setIsPending(true);
			try {
				const result = await destroy({ deleteBranch, force });
				for (const warning of result.warnings) toast.warning(warning);
				toast.success(`Deleted ${workspaceName}`);
				reset();
				onOpenChange(false);
				onDeleted?.();
			} catch (err) {
				setIsPending(false);
				setError(err as DestroyWorkspaceError);
			}
		},
		[destroy, deleteBranch, workspaceName, reset, onOpenChange, onDeleted],
	);

	return {
		deleteBranch,
		setDeleteBranch,
		isPending,
		error,
		clearError,
		handleOpenChange,
		run,
	};
}
