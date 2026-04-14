import { ConflictPane } from "./components/ConflictPane";
import { DestroyConfirmPane } from "./components/DestroyConfirmPane";
import { TeardownFailedPane } from "./components/TeardownFailedPane";
import { UnknownErrorPane } from "./components/UnknownErrorPane";
import { useDestroyDialogState } from "./hooks/useDestroyDialogState";

interface DashboardSidebarDeleteDialogProps {
	workspaceId: string;
	workspaceName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Fires after a successful destroy (any warnings reported via toast). */
	onDeleted?: () => void;
}

/**
 * Dispatches between confirm / conflict / teardown-failed / unknown-error
 * panes based on the error returned by `workspaceCleanup.destroy`. The
 * state hook owns the mutation; panes are dumb presentation components.
 */
export function DashboardSidebarDeleteDialog({
	workspaceId,
	workspaceName,
	open,
	onOpenChange,
	onDeleted,
}: DashboardSidebarDeleteDialogProps) {
	const {
		deleteBranch,
		setDeleteBranch,
		isPending,
		error,
		clearError,
		handleOpenChange,
		run,
	} = useDestroyDialogState({
		workspaceId,
		workspaceName,
		onOpenChange,
		onDeleted,
	});

	if (error?.kind === "conflict") {
		return (
			<ConflictPane
				open={open}
				onOpenChange={handleOpenChange}
				isPending={isPending}
				onForceDelete={() => run(true)}
			/>
		);
	}

	if (error?.kind === "teardown-failed") {
		return (
			<TeardownFailedPane
				open={open}
				onOpenChange={handleOpenChange}
				cause={error.cause}
				isPending={isPending}
				onForceDelete={() => run(true)}
			/>
		);
	}

	if (error?.kind === "unknown") {
		return (
			<UnknownErrorPane
				open={open}
				onOpenChange={handleOpenChange}
				message={error.message}
				onRetry={clearError}
			/>
		);
	}

	return (
		<DestroyConfirmPane
			open={open}
			onOpenChange={handleOpenChange}
			workspaceName={workspaceName}
			deleteBranch={deleteBranch}
			onDeleteBranchChange={setDeleteBranch}
			isPending={isPending}
			onConfirm={() => run(false)}
		/>
	);
}
