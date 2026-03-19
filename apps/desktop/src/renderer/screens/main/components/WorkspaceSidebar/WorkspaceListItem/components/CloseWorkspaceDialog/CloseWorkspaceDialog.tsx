import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";

interface CloseWorkspaceDialogProps {
	workspaceName: string;
	isWorktree: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (options: { moveToTrash: boolean }) => void;
}

export function CloseWorkspaceDialog({
	workspaceName,
	isWorktree,
	open,
	onOpenChange,
	onConfirm,
}: CloseWorkspaceDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[420px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-3">
					<AlertDialogTitle className="font-medium">
						Close workspace "{workspaceName}"?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="text-muted-foreground space-y-1.5">
							<span className="block">
								This will kill all active terminals in this workspace.
							</span>
							{isWorktree && (
								<span className="block text-xs">
									<strong>Close Workspace</strong> removes the workspace from
									the sidebar. Worktree files stay on disk.
									<br />
									<strong>Recycle Worktree</strong> closes the workspace and
									moves the worktree folder to Trash.
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
							onConfirm({ moveToTrash: false });
						}}
					>
						Close Workspace
					</Button>
					{isWorktree && (
						<Button
							variant="destructive"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => {
								onOpenChange(false);
								onConfirm({ moveToTrash: true });
							}}
						>
							Recycle Worktree
						</Button>
					)}
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
