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
import { useId, useState } from "react";

interface PrototypeCloseDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceName: string;
	onConfirm: () => void;
}

/**
 * Fixture stand-in for the real DashboardSidebarDeleteDialog's confirm pane —
 * same copy and layout, but "Delete" just removes the fixture workspace (the
 * branch checkbox is cosmetic).
 */
export function PrototypeCloseDialog({
	open,
	onOpenChange,
	workspaceName,
	onConfirm,
}: PrototypeCloseDialogProps) {
	const checkboxId = useId();
	const [deleteBranch, setDeleteBranch] = useState(false);

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
							onCheckedChange={(checked) => setDeleteBranch(checked === true)}
						/>
						<Label
							htmlFor={checkboxId}
							className="cursor-pointer select-none text-muted-foreground text-xs"
						>
							Also delete local branch
						</Label>
					</div>
				</div>
				<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pt-2 pb-4">
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
