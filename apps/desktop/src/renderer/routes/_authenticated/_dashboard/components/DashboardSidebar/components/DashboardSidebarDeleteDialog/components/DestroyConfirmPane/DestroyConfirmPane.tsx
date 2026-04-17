import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { Label } from "@superset/ui/label";
import { useId } from "react";

interface DestroyConfirmPaneProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceName: string;
	deleteBranch: boolean;
	onDeleteBranchChange: (next: boolean) => void;
	onConfirm: () => void;
}

/**
 * Default pane: the first click on "Delete". Offers the branch opt-in.
 * Confirm hands off to the parent which closes the dialog and runs the
 * destroy under a toast — no in-dialog pending state.
 */
export function DestroyConfirmPane({
	open,
	onOpenChange,
	workspaceName,
	deleteBranch,
	onDeleteBranchChange,
	onConfirm,
}: DestroyConfirmPaneProps) {
	const checkboxId = useId();
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Delete workspace "{workspaceName}"?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This removes the worktree from disk. The cloud workspace record will
						also be removed.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="px-4 pb-2">
					<div className="flex items-center gap-2">
						<Checkbox
							id={checkboxId}
							checked={deleteBranch}
							onCheckedChange={(checked) =>
								onDeleteBranchChange(checked === true)
							}
						/>
						<Label
							htmlFor={checkboxId}
							className="text-xs text-muted-foreground cursor-pointer select-none"
						>
							Also delete local branch
						</Label>
					</div>
				</div>
				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onConfirm}
					>
						Delete
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
