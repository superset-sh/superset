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
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function CloseProjectDialog({
	projectName,
	workspaceCount,
	open,
	onOpenChange,
	onConfirm,
}: CloseProjectDialogProps) {
	const handleConfirm = () => {
		onOpenChange(false);
		onConfirm();
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
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
					<Button
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={handleConfirm}
					>
						Close Project
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
