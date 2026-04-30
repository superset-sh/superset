import { DestroyConfirmPane } from "./components/DestroyConfirmPane";
import { TeardownFailedPane } from "./components/TeardownFailedPane";
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
 * Dispatches between confirm and teardown-failed panes based on the error
 * returned by `workspaceCleanup.destroy`. Dirty-worktree state is surfaced
 * inline as a banner on the confirm pane so the user only sees one warning
 * before the destroy runs.
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
		hasChanges,
		hasUnpushedCommits,
		canConfirm,
		blockingReason,
		isCheckingStatus,
		error,
		handleOpenChange,
		run,
	} = useDestroyDialogState({
		workspaceId,
		workspaceName,
		open,
		onOpenChange,
		onDeleted,
	});

	if (error?.kind === "teardown-failed") {
		return (
			<TeardownFailedPane
				open={open}
				onOpenChange={handleOpenChange}
				cause={error.cause}
				onForceDelete={() => run(true)}
			/>
		);
	}

	const hasWarnings = hasChanges || hasUnpushedCommits;
	const confirmLabel = isCheckingStatus
		? "Checking…"
		: hasWarnings
			? "Delete anyway"
			: "Delete";

	return (
		<DestroyConfirmPane
			open={open}
			onOpenChange={handleOpenChange}
			workspaceName={workspaceName}
			deleteBranch={deleteBranch}
			onDeleteBranchChange={setDeleteBranch}
			hasChanges={hasChanges}
			hasUnpushedCommits={hasUnpushedCommits}
			canConfirm={canConfirm}
			blockingReason={blockingReason}
			isCheckingStatus={isCheckingStatus}
			onConfirm={() => run(hasWarnings)}
			confirmLabel={confirmLabel}
		/>
	);
}
