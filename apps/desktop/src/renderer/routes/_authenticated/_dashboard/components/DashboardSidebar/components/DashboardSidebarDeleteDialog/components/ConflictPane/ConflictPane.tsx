import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";

interface ConflictPaneProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	isPending: boolean;
	/** Re-runs destroy with `force: true`. */
	onForceDelete: () => void;
}

/** Shown when `git worktree remove` refused (dirty tree, locked worktree). */
export function ConflictPane({
	open,
	onOpenChange,
	isPending,
	onForceDelete,
}: ConflictPaneProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[380px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Uncommitted changes in worktree
					</AlertDialogTitle>
					<AlertDialogDescription>
						The worktree has uncommitted or unlocked work. Force delete will
						discard it.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onForceDelete}
						disabled={isPending}
					>
						{isPending ? "Deleting..." : "Delete anyway"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
