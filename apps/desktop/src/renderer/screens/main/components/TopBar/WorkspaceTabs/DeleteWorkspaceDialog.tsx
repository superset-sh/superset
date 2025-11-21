import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useDeleteWorkspace } from "renderer/react-query/workspaces";

interface DeleteWorkspaceDialogProps {
	workspaceId: string;
	workspaceName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function DeleteWorkspaceDialog({
	workspaceId,
	workspaceName,
	open,
	onOpenChange,
}: DeleteWorkspaceDialogProps) {
	const [isDeleting, setIsDeleting] = useState(false);
	const deleteWorkspace = useDeleteWorkspace();

	// Query to check if workspace can be deleted
	const { data: canDeleteData, isLoading } = trpc.workspaces.canDelete.useQuery(
		{ id: workspaceId },
		{ enabled: open }, // Only run when dialog is open
	);

	const handleDelete = async () => {
		setIsDeleting(true);
		try {
			await deleteWorkspace.mutateAsync({ id: workspaceId });
			onOpenChange(false);
		} catch (error) {
			console.error("Failed to delete workspace:", error);
		} finally {
			setIsDeleting(false);
		}
	};

	const canDelete = canDeleteData?.canDelete ?? true;
	const reason = canDeleteData?.reason;
	const warning = canDeleteData?.warning;

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Workspace</AlertDialogTitle>
					<AlertDialogDescription>
						{isLoading ? (
							<span>Checking workspace status...</span>
						) : !canDelete ? (
							<span className="text-destructive">
								Cannot delete workspace: {reason}
							</span>
						) : (
							<>
								Are you sure you want to delete "{workspaceName}"?
								{warning && (
									<span className="block mt-2 text-yellow-600 dark:text-yellow-400">
										Warning: {warning}
									</span>
								)}
								<span className="block mt-2">
									This will remove the workspace and its associated git
									worktree. This action cannot be undone.
								</span>
							</>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={(e: React.MouseEvent) => {
							e.preventDefault();
							handleDelete();
						}}
						disabled={!canDelete || isDeleting || isLoading}
						className="bg-destructive text-white hover:bg-destructive/90"
					>
						{isDeleting ? "Deleting..." : "Delete"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
