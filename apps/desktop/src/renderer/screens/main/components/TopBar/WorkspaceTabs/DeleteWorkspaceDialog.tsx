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
	const [error, setError] = useState<string | null>(null);
	const deleteWorkspace = useDeleteWorkspace();

	const handleDelete = async () => {
		setIsDeleting(true);
		setError(null);
		try {
			const result = await deleteWorkspace.mutateAsync({ id: workspaceId });
			if (result.warning) {
				// Show warning to user but still close dialog
				console.warn("Workspace deleted with warning:", result.warning);
				// TODO: Show toast notification with warning
			}
			onOpenChange(false);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to delete workspace";
			setError(errorMessage);
			console.error("Failed to delete workspace:", error);
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Workspace</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to delete "{workspaceName}"?
						<span className="block mt-2">
							This will remove the workspace and its associated git worktree.
							This action cannot be undone.
						</span>
						{error && (
							<span className="block mt-2 text-destructive">{error}</span>
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
						disabled={isDeleting}
						className="bg-destructive text-white hover:bg-destructive/90"
					>
						{isDeleting ? "Deleting..." : "Delete"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
