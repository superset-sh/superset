import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import type { FileTreeNode } from "shared/file-tree-types";

interface DeleteConfirmDialogProps {
	node: FileTreeNode | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isDeleting?: boolean;
}

export function DeleteConfirmDialog({
	node,
	open,
	onOpenChange,
	onConfirm,
	isDeleting = false,
}: DeleteConfirmDialogProps) {
	if (!node) return null;

	const itemType = node.isDirectory ? "folder" : "file";
	const title = `Delete ${itemType} "${node.name}"?`;
	const description = node.isDirectory
		? "This folder and all its contents will be moved to the trash. This action can be undone from the system trash."
		: "This file will be moved to the trash. This action can be undone from the system trash.";

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
						disabled={isDeleting}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onConfirm}
						disabled={isDeleting}
					>
						{isDeleting ? "Deleting..." : "Delete"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
