import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";

interface CloseProjectDialogProps {
	projectName: string;
	workspaceCount: number;
	hasWorktrees: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (options: { deleteWorktrees: boolean }) => void;
}

export function CloseProjectDialog({
	projectName,
	workspaceCount,
	hasWorktrees,
	open,
	onOpenChange,
	onConfirm,
}: CloseProjectDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[420px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-3">
					<AlertDialogTitle className="font-medium">
						Close project "{projectName}"?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="text-muted-foreground space-y-1.5">
							<span className="block">
								This will close {workspaceCount} workspace
								{workspaceCount !== 1 ? "s" : ""} and kill all active terminals
								in this project.
							</span>
							{hasWorktrees && (
								<span className="block text-xs">
									<strong>Close Project</strong> removes the project from the
									sidebar. Worktree files stay on disk.
									<br />
									<strong>Recycle Worktrees</strong> closes the project and moves
									all worktree folders to Trash.
								</span>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

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
						variant="outline"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => {
							onOpenChange(false);
							onConfirm({ deleteWorktrees: false });
						}}
					>
						Close Project
					</Button>
					{hasWorktrees && (
						<Button
							variant="destructive"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => {
								onOpenChange(false);
								onConfirm({ deleteWorktrees: true });
							}}
						>
							Recycle Worktrees
						</Button>
					)}
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
