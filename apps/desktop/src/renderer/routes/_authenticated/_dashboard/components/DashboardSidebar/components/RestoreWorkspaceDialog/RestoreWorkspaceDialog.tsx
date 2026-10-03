import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { useRestoreWorkspace } from "renderer/hooks/host-service/useRestoreWorkspace";

interface RestoreWorkspaceDialogProps {
	workspaceId: string;
	workspaceName: string;
	branch: string;
	hostId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onRestored?: () => void;
}

/**
 * Confirm dialog for restoring an archived worktree workspace. States the
 * honest limits up front: only committed or pushed work comes back, and a
 * branch deleted both locally and on the remote is gone for good.
 */
export function RestoreWorkspaceDialog({
	workspaceId,
	workspaceName,
	branch,
	hostId,
	open,
	onOpenChange,
	onRestored,
}: RestoreWorkspaceDialogProps) {
	const { t } = useLingui();
	const { restore } = useRestoreWorkspace(workspaceId, hostId);
	const [isRunning, setIsRunning] = useState(false);

	const handleConfirm = async () => {
		if (isRunning) return;
		setIsRunning(true);
		try {
			const result = await restore();
			toast.success(
				t({
					message: `Workspace "${workspaceName}" restored`,
				}),
				{
					description:
						result.restoredFrom === "remote"
							? t({
									message: `Branch recreated from remote "${branch}"`,
								})
							: undefined,
				},
			);
			onOpenChange(false);
			onRestored?.();
		} catch (error) {
			toast.error(
				t({
					message: `Failed to restore "${workspaceName}": ${errorMessage(
						error,
						t({ message: "Unknown error" }),
					)}`,
				}),
			);
		} finally {
			setIsRunning(false);
		}
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<EnterEnabledAlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						<Trans>Restore workspace "{workspaceName}"?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans>
							This re-creates the worktree from branch "{branch}". Only
							committed or pushed work comes back — uncommitted changes are
							gone, and a branch deleted both locally and on the remote cannot
							be restored.
						</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="px-4 pb-4">
					<AlertDialogCancel disabled={isRunning}>
						<Trans>Cancel</Trans>
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={(event) => {
							// The action closes the dialog on click by default —
							// hold it open through the run so the Restoring state
							// is visible and failures stay retryable in place.
							event.preventDefault();
							void handleConfirm();
						}}
						disabled={isRunning}
					>
						{isRunning ? <Trans>Restoring…</Trans> : <Trans>Restore</Trans>}
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
