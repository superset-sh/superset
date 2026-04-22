import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";

interface ArchiveProjectDialogProps {
	projectName: string;
	workspaceCount: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function ArchiveProjectDialog({
	projectName,
	workspaceCount,
	open,
	onOpenChange,
	onConfirm,
}: ArchiveProjectDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<EnterEnabledAlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Archive project "{projectName}"?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="text-muted-foreground space-y-1.5">
							<span className="block">
								This will hide the project from the sidebar, kill terminals for{" "}
								{workspaceCount} workspace
								{workspaceCount !== 1 ? "s" : ""}, and close their editor tabs
								here. Workspaces stay in your database so you can restore later.
							</span>
							<span className="block">
								Your files and git history will remain on disk.
							</span>
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
					<AlertDialogAction
						variant="default"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onConfirm}
					>
						Archive
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
