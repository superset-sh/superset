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
	hasChanges: boolean;
	hasUnpushedCommits: boolean;
	canConfirm: boolean;
	blockingReason: string | null;
	isCheckingStatus: boolean;
	onConfirm: () => void;
	confirmLabel: string;
}

export function DestroyConfirmPane({
	open,
	onOpenChange,
	workspaceName,
	deleteBranch,
	onDeleteBranchChange,
	hasChanges,
	hasUnpushedCommits,
	canConfirm,
	blockingReason,
	isCheckingStatus,
	onConfirm,
	confirmLabel,
}: DestroyConfirmPaneProps) {
	const checkboxId = useId();
	const hasWarnings = hasChanges || hasUnpushedCommits;
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
				{hasWarnings && (
					<div className="px-4 pb-2">
						<div className="text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-md px-2.5 py-1.5">
							{hasChanges && hasUnpushedCommits
								? "Has uncommitted changes and unpushed commits"
								: hasChanges
									? "Has uncommitted changes"
									: "Has unpushed commits"}
						</div>
					</div>
				)}
				{blockingReason && (
					<div className="px-4 pb-2">
						<div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-2.5 py-1.5">
							{blockingReason}
						</div>
					</div>
				)}
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
						disabled={isCheckingStatus || !canConfirm}
					>
						{confirmLabel}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
